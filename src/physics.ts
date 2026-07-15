import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// ═══════════════════════════════════════════════════════════════
// Complete real-world table tennis physics (mm, kg, s)
// ═══════════════════════════════════════════════════════════════

// ── Ball (ITTF standard) ──
const BALL_R = 20;           // mm radius (40mm diameter)
const BALL_MASS = 0.0027;    // kg (2.7g)
const BALL_A = Math.PI * BALL_R * BALL_R; // cross-section 1256.6 mm²
const BALL_I = (2 / 5) * BALL_MASS * BALL_R * BALL_R; // moment of inertia (solid sphere)

// ── Surface interaction ──
const BALL_COR = 0.90;       // coefficient of restitution (ITTF: 305mm drop → 240-260mm bounce)
const TABLE_COR = 0.90;
const BALL_FRIC = 0.55;      // sliding friction coefficient (plastic on wood)
const TABLE_FRIC = 0.55;

// ── Air (ISA sea level) ──
const RHO = 1.225e-9;        // kg/mm³ (1.225 kg/m³)
const CD = 0.45;             // drag coefficient for smooth sphere at Re ~ 10⁴–10⁵
const CM_BASE = 0.25;        // Magnus lift coefficient base

// ── Gravity ──
const GRAVITY = 9810;        // mm/s²

// ═══════════════════════════════════════════════════════════════

let world: any;

export interface RapierBall {
  body: any;
  mesh: THREE.Mesh;
  t: number;
}

const balls: RapierBall[] = [];
let readyFlag = false;

export async function init(): Promise<void> {
  await RAPIER.init();

  world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.integrationParameters.dt = 1 / 60;
  world.integrationParameters.maxCcdSubsteps = 3;
  readyFlag = true;
  console.log('[physics] Rapier world ready, gravity:', GRAVITY, 'mm/s²');

  // Table: 2740×25×1525mm, top at y=785mm
  const tBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(1370, 12.5, 762.5)
      .setTranslation(1370, 772.5, -762.5)
      .setFriction(TABLE_FRIC)
      .setRestitution(TABLE_COR)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average),
    tBody,
  );

  // Net
  const nBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(7, 76, 610)
      .setTranslation(1370, 861, -763)
      .setFriction(0.3).setRestitution(0.4),
    nBody,
  );

  // Floor
  const fBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(8000, 1, 8000)
      .setTranslation(0, -3, 0)
      .setFriction(0.3).setRestitution(0.1),
    fBody,
  );
}

// ═══════════════════════════════════════════════════════════════
// Aerodynamic forces (applied before each physics step)
// ═══════════════════════════════════════════════════════════════

function applyAero(): void {
  for (const b of balls) {
    const v = b.body.linvel();
    const w = b.body.angvel();
    const vx: number = v.x, vy: number = v.y, vz: number = v.z;
    const wx: number = w.x, wy: number = w.y, wz: number = w.z;
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed < 0.01) continue;

    // ── Quadratic drag: F = -½·ρ·Cd·A·|v|·v ──
    const dragMag = 0.5 * RHO * CD * BALL_A * speed * speed;
    const dragX = -dragMag * vx / speed;
    const dragY = -dragMag * vy / speed;
    const dragZ = -dragMag * vz / speed;

    // ── Magnus force: F = ½·ρ·A·Cl·v² · dir(ω×v) ──
    const spinRate = Math.sqrt(wx * wx + wy * wy + wz * wz);
    let mx = 0, my = 0, mz = 0;

    if (spinRate > 0.1) {
      const S = (BALL_R * spinRate) / speed;       // spin parameter
      const Cl = CM_BASE * S / (0.2 + S);           // smooth Cl(S) model
      const magnusMag = Cl * 0.5 * RHO * BALL_A * speed * speed;

      // Cross product ω × v
      const cpx = wy * vz - wz * vy;
      const cpy = wz * vx - wx * vz;
      const cpz = wx * vy - wy * vx;
      const cpLen = Math.sqrt(cpx * cpx + cpy * cpy + cpz * cpz);
      if (cpLen > 1e-9) {
        mx = magnusMag * cpx / cpLen;
        my = magnusMag * cpy / cpLen;
        mz = magnusMag * cpz / cpLen;
      }
    }

    b.body.addForce({ x: dragX + mx, y: dragY + my, z: dragZ + mz }, true);
  }
}

// ═══════════════════════════════════════════════════════════════

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
      .setLinearDamping(0)      // we handle drag ourselves
      .setAngularDamping(0.01)  // tiny spin decay from air skin friction
      .setCcdEnabled(true),
  );

  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_R)
      .setMass(BALL_MASS)
      .setFriction(BALL_FRIC)
      .setRestitution(BALL_COR)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average),
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
export function isReady(): boolean { return readyFlag; }

export function step(): void {
  if (!readyFlag) return;
  applyAero();
  world.step();
}

export function syncMeshes(): void {
  if (!readyFlag) return;
  for (const b of balls) {
    const p = b.body.translation();
    const r = b.body.rotation();
    b.mesh.position.set(p.x, p.y, p.z);
    b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}
