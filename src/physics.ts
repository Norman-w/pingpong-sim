import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// ═══ Real-world table tennis constants (mm, kg, s) ═══
const GRAVITY = 9810;        // mm/s²
const BALL_R = 20;           // mm radius (40mm dia)
const BALL_MASS = 0.0027;    // kg (2.7g)
const BALL_COR = 0.95;       // restitution: Multiply → 0.95×0.95=0.90 effective
const TABLE_COR = 0.95;
const BALL_FRIC = 0.55;      // friction
const TABLE_FRIC = 0.55;

let world: any;

export interface RapierBall {
  body: any;
  mesh: THREE.Mesh;
  t: number;
}

const balls: RapierBall[] = [];

export async function init(): Promise<void> {
  await RAPIER.init();

  // World: gravity = (0, -9810, 0) mm/s²
  // Plain object OK — VectorOps.intoRaw() converts it in step()
  world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.integrationParameters.dt = 1 / 60;
  world.integrationParameters.maxCcdSubsteps = 3;
  console.log('[physics] Rapier world ready');

  // Table surface cuboid: 2740×25×1525mm at (1370, 772.5, -762.5)
  const tBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(1370, 12.5, 762.5)
      .setTranslation(1370, 772.5, -762.5)
      .setFriction(TABLE_FRIC)
      .setRestitution(TABLE_COR)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply),
    tBody,
  );

  // Net cuboid
  const nBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(7, 76, 610)
      .setTranslation(1370, 861, -763)
      .setFriction(0.3)
      .setRestitution(0.4),
    nBody,
  );

  // Floor
  const fBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(8000, 1, 8000)
      .setTranslation(0, -3, 0)
      .setFriction(0.3)
      .setRestitution(0.15),
    fBody,
  );
}

export function createBall(
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  mesh: THREE.Mesh,
): RapierBall | null {
  if (!world) return null;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinvel(vx, vy, vz)
      .setLinearDamping(0.5)
      .setAngularDamping(0.8)
      .setCcdEnabled(true)
      .setCanSleep(true),
  );

  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_R)
      .setMass(BALL_MASS)
      .setFriction(BALL_FRIC)
      .setRestitution(BALL_COR)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply),
    body,
  );

  const ball: RapierBall = { body, mesh, t: 0 };
  balls.push(ball);
  return ball;
}

export function removeBall(ball: RapierBall): void {
  const i = balls.indexOf(ball);
  if (i >= 0) balls.splice(i, 1);
  world.removeRigidBody(ball.body);
}

export function clearAllBalls(): void {
  for (const b of balls) world.removeRigidBody(b.body);
  balls.length = 0;
}

export function getBalls(): readonly RapierBall[] { return balls; }
export function getBallCount(): number { return balls.length; }

export function isReady(): boolean { return world != null; }

export function step(): void {
  if (!world) return;
  world.step();
}

export function syncMeshes(): void {
  if (!world) return;
  for (const b of balls) {
    const p = b.body.translation();
    const r = b.body.rotation();
    b.mesh.position.set(p.x, p.y, p.z);
    b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}
