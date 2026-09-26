import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  BALL_INERTIA,
  BALL_MASS,
  BALL_RADIUS,
  TABLE_IMPACT_PROFILES,
  TABLE_TOP,
  resolveTableImpactKinematics,
  type TableImpactEvent,
  type TableImpactProfile,
} from './domain/tableImpact';
import { aerodynamicForces } from './domain/aerodynamics';

// Rapier runs in coherent SI units. Rendering/STL data remains in millimetres.
const MM_PER_M = 1000;
const FIXED_DT = 1 / 240;
const MAX_FRAME_TIME = 0.1;

const GRAVITY = 9.81;

const TABLE_MIN_X = BALL_RADIUS;
const TABLE_MAX_X = 2.740 - BALL_RADIUS;
const TABLE_MIN_Z = -1.525 + BALL_RADIUS;
const TABLE_MAX_Z = -BALL_RADIUS;
const VENUE_LENGTH = 14;
const VENUE_WIDTH = 7;
const BARRIER_HEIGHT = 0.7;
const BARRIER_THICKNESS = 0.038;

// A rigid-body solver's Coulomb friction does not dissipate pure rolling.
// Real balls lose energy through shell/table deformation and contact hysteresis.
const ROLLING_RESISTANCE = 0.0015;
const RESTING_LINEAR_SPEED = 0.001;
const RESTING_VERTICAL_SPEED = 0.025;
const TORSIONAL_DECELERATION = 0.5;

let world: any;
let accumulator = 0;
let readyFlag = false;

export interface RapierBall {
  body: any;
  collider: any;
  mesh: THREE.Mesh;
  t: number;
  supportedByTable: boolean;
  tableImpacts: number;
  lastTableImpact: { x: number; z: number } | null;
  tableImpactProfile: TableImpactProfile;
  tableImpactHistory: TableImpactEvent[];
}

const balls: RapierBall[] = [];

const mm = (value: number): number => value / MM_PER_M;

export async function init(): Promise<void> {
  await RAPIER.init();

  world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.integrationParameters.dt = FIXED_DT;
  world.integrationParameters.lengthUnit = 1;
  world.integrationParameters.maxCcdSubsteps = 4;
  world.integrationParameters.numSolverIterations = 8;

  // The model's visible tabletop top is y=760 mm, matching the ITTF datum.
  const tableBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  // The playing surface is a sensor because its top contact is resolved
  // explicitly below. This avoids a second cached solver impulse.
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(mm(1370), mm(12.5), mm(762.5))
      .setTranslation(mm(1370), mm(747.5), mm(-762.5))
      .setSensor(true),
    tableBody,
  );

  const netBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(mm(7), mm(76.25), mm(610))
      .setTranslation(mm(1370), mm(836.25), mm(-763))
      .setFriction(0.8)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitution(0.45)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply),
    netBody,
  );

  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    // Match the visible 14 m × 7 m competition floor. Its top is at the
    // rubber-mat plane (y=-30 mm), five millimetres below the shifted table
    // legs, so a resting ball remains visible instead of sinking below ground.
    RAPIER.ColliderDesc.cuboid(VENUE_LENGTH / 2, 0.001, VENUE_WIDTH / 2)
      .setTranslation(1.37, -0.031, -0.7625)
      .setFriction(0.8)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitution(0.35)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply),
    floorBody,
  );

  // The visual competition barriers are also solid bodies. They sit around
  // the 14 m × 7 m free zone and stop balls that reach the boundary instead
  // of allowing them to pass through the decorative meshes.
  const barrierSpecs: Array<[
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
  ]> = [
    [{ x: 1.37, y: 0.325, z: -0.7625 - VENUE_WIDTH / 2 }, { x: VENUE_LENGTH / 2, y: BARRIER_HEIGHT / 2, z: BARRIER_THICKNESS / 2 }],
    [{ x: 1.37, y: 0.325, z: -0.7625 + VENUE_WIDTH / 2 }, { x: VENUE_LENGTH / 2, y: BARRIER_HEIGHT / 2, z: BARRIER_THICKNESS / 2 }],
    [{ x: 1.37 - VENUE_LENGTH / 2, y: 0.325, z: -0.7625 }, { x: BARRIER_THICKNESS / 2, y: BARRIER_HEIGHT / 2, z: VENUE_WIDTH / 2 }],
    [{ x: 1.37 + VENUE_LENGTH / 2, y: 0.325, z: -0.7625 }, { x: BARRIER_THICKNESS / 2, y: BARRIER_HEIGHT / 2, z: VENUE_WIDTH / 2 }],
  ];
  for (const [position, halfExtents] of barrierSpecs) {
    const barrierBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0.65)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
        .setRestitution(0.18)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply),
      barrierBody,
    );
  }

  readyFlag = true;
  console.log('[physics] SI world ready at 240 Hz');
}

function applyAerodynamics(): void {
  for (const ball of balls) {
    // Rapier's addForce() stores a persistent force; it is not an impulse and
    // is not cleared automatically after world.step(). Aerodynamic forces must
    // be recomputed from the current velocity on every fixed step.
    ball.body.resetForces(false);
    ball.body.resetTorques(false);

    const v = ball.body.linvel();
    const w = ball.body.angvel();
    const aero = aerodynamicForces(v, w);
    ball.body.addForce(aero.force, true);
    ball.body.addTorque(aero.torque, true);

  }
}

function resolveTableImpact(ball: RapierBall): void {
  const p = ball.body.translation();
  const v = ball.body.linvel();
  const restingHeight = TABLE_TOP + BALL_RADIUS;
  const aboveTable =
    p.x >= TABLE_MIN_X && p.x <= TABLE_MAX_X &&
    p.z >= TABLE_MIN_Z && p.z <= TABLE_MAX_Z;

  if (ball.supportedByTable) {
    const knockedUp = v.y > 0.1 || p.y > restingHeight + 0.003;
    if (!aboveTable || knockedUp) {
      ball.supportedByTable = false;
      ball.body.setGravityScale(1, true);
    } else {
      ball.body.setTranslation({ x: p.x, y: restingHeight, z: p.z }, true);
      ball.body.setLinvel({ x: v.x, y: 0, z: v.z }, true);
      return;
    }
  }

  if (!aboveTable || v.y >= 0) return;

  // Predict crossing within this fixed step. The tabletop is a sensor, so this
  // explicit response is the single source of normal and tangential impulses.
  const nextY = p.y + v.y * FIXED_DT - 0.5 * GRAVITY * FIXED_DT ** 2;
  if (p.y >= restingHeight - 0.002 && nextY <= restingHeight) {
    const w = ball.body.angvel();
    ball.tableImpacts += 1;
    ball.lastTableImpact = { x: p.x, z: p.z };

    // Tangential contact impulse at the bottom of a hollow sphere. This is
    // what makes topspin kick forward, backspin hold up, and sidespin turn
    // after the bounce instead of behaving like differently coloured flat balls.
    const resolved = resolveTableImpactKinematics({
      linearVelocity: { x: v.x, y: v.y, z: v.z },
      angularVelocity: w,
    }, ball.tableImpactProfile);
    ball.tableImpactHistory.push(resolved.event);

    ball.body.setTranslation({ x: p.x, y: restingHeight, z: p.z }, true);
    ball.body.setLinvel({
      x: resolved.kinematics.linearVelocity.x,
      y: resolved.kinematics.linearVelocity.y,
      z: resolved.kinematics.linearVelocity.z,
    }, true);
    ball.body.setAngvel({
      x: resolved.kinematics.angularVelocity.x,
      y: resolved.kinematics.angularVelocity.y,
      z: resolved.kinematics.angularVelocity.z,
    }, true);
    if (resolved.kinematics.linearVelocity.y === 0) {
      ball.supportedByTable = true;
      ball.body.setGravityScale(0, true);
    }
  }
}

function applyTableRollingResistance(ball: RapierBall): void {
  const p = ball.body.translation();
  const v = ball.body.linvel();
  const restingHeight = TABLE_TOP + BALL_RADIUS;
  const supportedByTable =
    p.x >= TABLE_MIN_X && p.x <= TABLE_MAX_X &&
    p.z >= TABLE_MIN_Z && p.z <= TABLE_MAX_Z &&
    Math.abs(p.y - restingHeight) < 0.004 &&
    Math.abs(v.y) < 0.15;

  if (!supportedByTable) return;

  const horizontalSpeed = Math.hypot(v.x, v.z);
  if (
    horizontalSpeed <= RESTING_LINEAR_SPEED &&
    Math.abs(v.y) <= RESTING_VERTICAL_SPEED
  ) {
    // Remove solver-scale residual motion once it is below a physically
    // observable threshold. Keep Y for the contact solver to support gravity.
    ball.body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return;
  }

  if (horizontalSpeed > 0) {
    const speedLoss = ROLLING_RESISTANCE * GRAVITY * FIXED_DT;
    const nextSpeed = Math.max(0, horizontalSpeed - speedLoss);
    const scale = nextSpeed / horizontalSpeed;
    ball.body.setLinvel({ x: v.x * scale, y: v.y, z: v.z * scale }, true);
  }

  // Contact-patch twisting friction damps spin around the table normal.
  const w = ball.body.angvel();
  const yawLoss = TORSIONAL_DECELERATION * FIXED_DT;
  const nextYaw = Math.sign(w.y) * Math.max(0, Math.abs(w.y) - yawLoss);
  if (nextYaw !== w.y) {
    ball.body.setAngvel({ x: w.x, y: nextYaw, z: w.z }, true);
  }
}

export function createBall(
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  mesh: THREE.Mesh,
  tableImpactProfile: TableImpactProfile = TABLE_IMPACT_PROFILES.standard,
): RapierBall | null {
  if (!world) return null;

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(mm(x), mm(y), mm(z))
      .setLinvel(mm(vx), mm(vy), mm(vz))
      .setLinearDamping(0)
      // Angular damping is integrated from the source-backed fluid torque
      // table in applyAerodynamics(), so Rapier must not add a second
      // unexplained exponential damping term.
      .setAngularDamping(0)
      .setCcdEnabled(true)
      .setAdditionalSolverIterations(4),
  );

  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setMassProperties(
        BALL_MASS,
        { x: 0, y: 0, z: 0 },
        { x: BALL_INERTIA, y: BALL_INERTIA, z: BALL_INERTIA },
        { x: 0, y: 0, z: 0, w: 1 },
      )
      .setFriction(TABLE_IMPACT_PROFILES.standard.frictionCoefficient)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitution(0.85)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply),
    body,
  );

  const ball: RapierBall = {
    body,
    collider,
    mesh,
    t: 0,
    supportedByTable: false,
    tableImpacts: 0,
    lastTableImpact: null,
    tableImpactProfile,
    tableImpactHistory: [],
  };
  balls.push(ball);
  return ball;
}

export function removeBall(ball: RapierBall): void {
  const index = balls.indexOf(ball);
  if (index >= 0) balls.splice(index, 1);
  world.removeRigidBody(ball.body);
}

export function clearAllBalls(): void {
  for (const ball of balls) world.removeRigidBody(ball.body);
  balls.length = 0;
}

export function getBalls(): readonly RapierBall[] { return balls; }
export function getBallCount(): number { return balls.length; }
export function isReady(): boolean { return readyFlag; }

/** Drop pending fixed steps so a long hitch after spawn cannot jump the new ball mid-arc. */
export function resetStepAccumulator(): void {
  accumulator = 0;
}

// Advance by real elapsed time, independent of the display refresh rate.
export function step(elapsedSeconds: number): void {
  if (!readyFlag) return;
  accumulator += Math.min(Math.max(elapsedSeconds, 0), MAX_FRAME_TIME);

  while (accumulator >= FIXED_DT) {
    applyAerodynamics();
    for (const ball of balls) {
      resolveTableImpact(ball);
      applyTableRollingResistance(ball);
    }
    world.step();
    for (const ball of balls) ball.t += FIXED_DT;
    accumulator -= FIXED_DT;
  }
}

export function syncMeshes(): void {
  if (!readyFlag) return;
  for (const ball of balls) {
    const p = ball.body.translation();
    const r = ball.body.rotation();
    ball.mesh.position.set(p.x * MM_PER_M, p.y * MM_PER_M, p.z * MM_PER_M);
    ball.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}
