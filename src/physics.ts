import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

let world: any;

// Track balls for sync
interface RapierBall {
  body: any;       // RAPIER.RigidBody
  collider: any;   // RAPIER.Collider
  mesh: THREE.Mesh;
  t: number;
}

const balls: RapierBall[] = [];
const R = 20; // ball radius mm

export async function init(): Promise<void> {
  await RAPIER.init();
  console.log('[physics] Rapier3D initialized, World:', typeof RAPIER.World);

  // World: gravity 9810 mm/s² downward (Y axis)
  world = new RAPIER.World({ x: 0, y: -9810, z: 0 });
  console.log('[physics] World created');

  // --- Table surface ---
  // STL table: X 0..2740, Y surface 785, Z -1525..0 (half-extents for cuboid)
  const tableBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(1370, 12.5, 762.5)
      .setTranslation(1370, 772.5, -762.5)
      .setFriction(0.6)
      .setRestitution(0.85),
    tableBody,
  );

  // --- Net ---
  // X=1370, Y~785..937.5, Z~-1373..-152.5
  const netBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(7, 76, 610)
      .setTranslation(1370, 861, -763)
      .setFriction(0.3)
      .setRestitution(0.5),
    netBody,
  );

  // --- Floor ---
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(8000, 1, 8000)
      .setTranslation(0, -3, 0)
      .setFriction(0.3)
      .setRestitution(0.2),
    floorBody,
  );
}

export function createBall(
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  mesh: THREE.Mesh,
): RapierBall {
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setLinvel(vx, vy, vz)
    .setLinearDamping(0.001)
    .setAngularDamping(0.01)
    .setCcdEnabled(true);

  const body = world.createRigidBody(bodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.ball(R)
    .setFriction(0.5)
    .setRestitution(0.85)
    .setDensity(0.0027 / ((4 / 3) * Math.PI * R * R * R)) // 2.7g mass
    .setMass(0.0027);

  const collider = world.createCollider(colliderDesc, body);

  const ball: RapierBall = { body, collider, mesh, t: 0 };
  balls.push(ball);
  return ball;
}

export function removeBall(ball: RapierBall): void {
  const idx = balls.indexOf(ball);
  if (idx >= 0) balls.splice(idx, 1);
  world.removeRigidBody(ball.body);
}

export function clearAllBalls(): void {
  for (const b of balls) {
    world.removeRigidBody(b.body);
  }
  balls.length = 0;
}

export function getBalls(): readonly RapierBall[] {
  return balls;
}

function ready(): boolean {
  return world != null;
}

export function step(): void {
  if (!ready()) return;
  world.step();
}

export function syncMeshes(): void {
  if (!ready()) return;
  for (const b of balls) {
    const pos = b.body.translation();
    const rot = b.body.rotation();
    b.mesh.position.set(pos.x, pos.y, pos.z);
    b.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    // Visual spin from angular velocity
    const angvel = b.body.angvel();
    const speed = Math.sqrt(
      angvel.x * angvel.x + angvel.y * angvel.y + angvel.z * angvel.z,
    );
    if (speed > 1) {
      b.mesh.rotateOnWorldAxis(
        new THREE.Vector3(angvel.x, angvel.y, angvel.z).normalize(),
        speed * 0.001,
      );
    }
  }
}

export function getBallCount(): number {
  return balls.length;
}
