import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Rapier runs in coherent SI units. Rendering/STL data remains in millimetres.
const MM_PER_M = 1000;
const FIXED_DT = 1 / 240;
const MAX_FRAME_TIME = 0.1;

// ITTF ball and standard atmosphere.
const BALL_RADIUS = 0.020;
const BALL_MASS = 0.0027;
const BALL_AREA = Math.PI * BALL_RADIUS ** 2;
const BALL_VOLUME = (4 / 3) * Math.PI * BALL_RADIUS ** 3;
const BALL_INERTIA = (2 / 3) * BALL_MASS * BALL_RADIUS ** 2; // thin spherical shell
const AIR_DENSITY = 1.204;
const DRAG_COEFFICIENT = 0.55;
const GRAVITY = 9.81;

// Experimental ball/table dynamic friction is approximately 0.25. Rapier's
// Multiply rule lets the ball carry the measured pair coefficient while fixed
// surfaces use 1.0.
const BALL_TABLE_FRICTION = 0.25;
const TABLE_TOP = 0.785;
const TABLE_MIN_X = BALL_RADIUS;
const TABLE_MAX_X = 2.740 - BALL_RADIUS;
const TABLE_MIN_Z = -1.525 + BALL_RADIUS;
const TABLE_MAX_Z = -BALL_RADIUS;

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
}

const balls: RapierBall[] = [];

const mm = (value: number): number => value / MM_PER_M;

// Speed-dependent restitution calibrated to the ITTF table test: a 300 mm
// drop returns approximately 230 mm (e ~= sqrt(230/300) before air losses).
// At tiny speeds a zero-restitution dead-band represents real viscoelastic
// losses and prevents an ideal rigid-body solver from micro-bouncing forever.
function tableRestitution(impactSpeed: number): number {
  const calibratedRestitution = THREE.MathUtils.clamp(
    0.93 - 0.02 * impactSpeed,
    0.55,
    0.90,
  );

  // Real low-speed impacts transition continuously from elastic rebound to
  // deformation/contact losses. Smoothstep avoids an abrupt "lead ball" stop.
  const lowSpeedRatio = THREE.MathUtils.clamp(
    (impactSpeed - 0.005) / (0.30 - 0.005),
    0,
    1,
  );
  const lowSpeedElasticity =
    lowSpeedRatio * lowSpeedRatio * (3 - 2 * lowSpeedRatio);
  return calibratedRestitution * lowSpeedElasticity;
}

export async function init(): Promise<void> {
  await RAPIER.init();

  world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.integrationParameters.dt = FIXED_DT;
  world.integrationParameters.lengthUnit = 1;
  world.integrationParameters.maxCcdSubsteps = 4;
  world.integrationParameters.numSolverIterations = 8;

  // The model's visible tabletop top is y=785 mm.
  const tableBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  // The playing surface is a sensor because its top contact is resolved
  // explicitly below. This avoids a second cached solver impulse.
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(mm(1370), mm(12.5), mm(762.5))
      .setTranslation(mm(1370), mm(772.5), mm(-762.5))
      .setSensor(true),
    tableBody,
  );

  const netBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(mm(7), mm(76), mm(610))
      .setTranslation(mm(1370), mm(861), mm(-763))
      .setFriction(0.8)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitution(0.45)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply),
    netBody,
  );

  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(8, 0.001, 8)
      .setTranslation(0, -0.003, 0)
      .setFriction(0.8)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitution(0.35)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply),
    floorBody,
  );

  readyFlag = true;
  console.log('[physics] SI world ready at 240 Hz');
}

function applyAerodynamics(): void {
  for (const ball of balls) {
    // Rapier's addForce() stores a persistent force; it is not an impulse and
    // is not cleared automatically after world.step(). Aerodynamic forces must
    // be recomputed from the current velocity on every fixed step.
    ball.body.resetForces(false);

    const v = ball.body.linvel();
    const w = ball.body.angvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < 1e-4) continue;

    // Fd = -1/2 rho Cd A |v| v.
    const dragScale = -0.5 * AIR_DENSITY * DRAG_COEFFICIENT * BALL_AREA * speed;
    let fx = dragScale * v.x;
    let fy = dragScale * v.y;
    let fz = dragScale * v.z;

    // Empirical table-tennis Magnus model used for spin-dependent flight.
    // Direction is omega x velocity (equivalent to -velocity x omega).
    const spin = Math.hypot(w.x, w.y, w.z);
    if (spin > 1 && speed > 0.1) {
      const magnusCoefficient = THREE.MathUtils.clamp(
        0.1 * speed / (BALL_RADIUS * spin) - 0.001,
        0,
        0.5,
      );
      const magnusScale = AIR_DENSITY * BALL_VOLUME * magnusCoefficient;
      fx += magnusScale * (w.y * v.z - w.z * v.y);
      fy += magnusScale * (w.z * v.x - w.x * v.z);
      fz += magnusScale * (w.x * v.y - w.y * v.x);
    }

    ball.body.addForce({ x: fx, y: fy, z: fz }, true);

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

  // Predict crossing within this fixed step. Resolving the normal impulse here
  // gives an exact, speed-dependent bounce; the zero-restitution Rapier table
  // then only prevents penetration and supplies static/sliding friction.
  const nextY = p.y + v.y * FIXED_DT - 0.5 * GRAVITY * FIXED_DT ** 2;
  if (p.y >= restingHeight - 0.002 && nextY <= restingHeight) {
    const restitution = tableRestitution(Math.abs(v.y));
    ball.body.setTranslation({ x: p.x, y: restingHeight, z: p.z }, true);
    ball.body.setLinvel({ x: v.x, y: -v.y * restitution, z: v.z }, true);
    if (restitution === 0) {
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
): RapierBall | null {
  if (!world) return null;

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(mm(x), mm(y), mm(z))
      .setLinvel(mm(vx), mm(vy), mm(vz))
      .setLinearDamping(0)
      .setAngularDamping(0.015)
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
      .setFriction(BALL_TABLE_FRICTION)
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
