//#region 导入/依赖
import { type LaunchSolution } from './shotCatalog';
//#endregion

//#region 常量/配置
export const BALL_RADIUS = 0.020;
export const BALL_MASS = 0.0027;
export const BALL_AREA = Math.PI * BALL_RADIUS ** 2;
export const BALL_VOLUME = (4 / 3) * Math.PI * BALL_RADIUS ** 3;
export const BALL_INERTIA = (2 / 3) * BALL_MASS * BALL_RADIUS ** 2;
export const BALL_TABLE_FRICTION = 0.25;
const AIR_DENSITY = 1.204;
const DRAG_COEFFICIENT = 0.55;
const GRAVITY = 9.81;
export const TABLE_CONTACT_Y = 0.805;
export const NET_X = 1.370;
export const RPM_TO_RAD = 2 * Math.PI / 60;
//#endregion

//#region 模型/类型
export interface SimState { x: number; y: number; z: number; vx: number; vy: number; vz: number; }
export interface SimResult { state: SimState; time: number; netY: number; }
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API

export function advanceSimulation(
  state: SimState,
  angularVelocity: { x: number; y: number; z: number },
  dt: number,
): void {
  const speed = Math.hypot(state.vx, state.vy, state.vz);
  const dragScale = speed > 1e-6
    ? -0.5 * AIR_DENSITY * DRAG_COEFFICIENT * BALL_AREA * speed / BALL_MASS
    : 0;
  let ax = dragScale * state.vx;
  let ay = -GRAVITY + dragScale * state.vy;
  let az = dragScale * state.vz;
  const crossX = angularVelocity.y * state.vz - angularVelocity.z * state.vy;
  const crossY = angularVelocity.z * state.vx - angularVelocity.x * state.vz;
  const crossZ = angularVelocity.x * state.vy - angularVelocity.y * state.vx;
  const crossMagnitude = Math.hypot(crossX, crossY, crossZ);
  if (crossMagnitude > 1e-5 && speed > 0.1) {
    const spinParameter = BALL_RADIUS * crossMagnitude / (speed * speed);
    const liftCoefficient = 0.5 * (1 - Math.exp(-1.8 * spinParameter));
    const liftAcceleration = 0.5 * AIR_DENSITY * BALL_AREA * liftCoefficient * speed * speed / BALL_MASS;
    const scale = liftAcceleration / crossMagnitude;
    ax += scale * crossX;
    ay += scale * crossY;
    az += scale * crossZ;
  }
  state.vx += ax * dt; state.vy += ay * dt; state.vz += az * dt;
  state.x += state.vx * dt; state.y += state.vy * dt; state.z += state.vz * dt;
}

export function simulateToTarget(
  origin: SimState,
  angularVelocity: { x: number; y: number; z: number },
  targetX: number,
): SimResult {
  const state = { ...origin };
  const dt = 1 / 480;
  let time = 0;
  let netY = origin.y;
  let recordedNet = false;

  while (state.x < targetX && time < 1.5) {
    advanceSimulation(state, angularVelocity, dt);
    time += dt;

    if (!recordedNet && state.x >= NET_X) {
      netY = state.y;
      recordedNet = true;
    }
  }

  return { state, time, netY };
}

export function evaluateServe(
  origin: SimState,
  angularVelocity: { x: number; y: number; z: number },
): {
  first?: { x: number; z: number; time: number };
  second?: { x: number; z: number; time: number };
  netY: number;
} {
  const state = { ...origin };
  const w = { ...angularVelocity };
  const hits: Array<{ x: number; z: number; time: number }> = [];
  let netY = 0;
  let sawNet = false;
  const dt = 1 / 480;
  for (let t = 0; t < 1.5 && state.x < 3.2 && state.y > 0; t += dt) {
    const previousY = state.y;
    advanceSimulation(state, w, dt);
    if (!sawNet && hits.length > 0 && state.x >= NET_X) { netY = state.y; sawNet = true; }
    if (
      state.vy < 0 && previousY >= TABLE_CONTACT_Y && state.y <= TABLE_CONTACT_Y &&
      state.x >= 0.02 && state.x <= 2.72 && state.z >= -1.505 && state.z <= -0.02
    ) {
      hits.push({ x: state.x, z: state.z, time: t });
      const impact = Math.abs(state.vy);
      const restitution = Math.max(0.55, Math.min(0.90, 0.93 - 0.02 * impact));
      const contactVx = state.vx + w.z * BALL_RADIUS;
      const contactVz = state.vz - w.x * BALL_RADIUS;
      const contactSpeed = Math.hypot(contactVx, contactVz);
      let impulseX = 0;
      let impulseZ = 0;
      if (contactSpeed > 1e-6) {
        const stickingImpulse = 0.4 * BALL_MASS * contactSpeed;
        const normalImpulse = BALL_MASS * (1 + restitution) * impact;
        const impulseMagnitude = Math.min(stickingImpulse, BALL_TABLE_FRICTION * normalImpulse);
        impulseX = -impulseMagnitude * contactVx / contactSpeed;
        impulseZ = -impulseMagnitude * contactVz / contactSpeed;
      }
      state.y = TABLE_CONTACT_Y;
      state.vy = impact * restitution;
      state.vx += impulseX / BALL_MASS;
      state.vz += impulseZ / BALL_MASS;
      w.x -= BALL_RADIUS * impulseZ / BALL_INERTIA;
      w.z += BALL_RADIUS * impulseX / BALL_INERTIA;
      if (hits.length >= 2) break;
    }
  }
  return { first: hits[0], second: hits[1], netY };
}

export function evaluateRally(
  origin: SimState,
  angularVelocity: { x: number; y: number; z: number },
): { impact?: { x: number; z: number }; netY: number } {
  const state = { ...origin };
  let netY = origin.y;
  let sawNet = false;
  const dt = 1 / 480;
  for (let t = 0; t < 2 && state.x < 4.2 && state.y > 0; t += dt) {
    const previousY = state.y;
    advanceSimulation(state, angularVelocity, dt);
    if (!sawNet && state.x >= NET_X) {
      netY = state.y;
      sawNet = true;
    }
    if (state.vy < 0 && previousY >= TABLE_CONTACT_Y && state.y <= TABLE_CONTACT_Y && state.x > NET_X) {
      return { impact: { x: state.x, z: state.z }, netY };
    }
  }
  return { netY };
}

export interface SampledTrajectory {
  points: Array<{ x: number; y: number; z: number }>;
  tableImpacts: Array<{ x: number; y: number; z: number }>;
}

export function sampleTrajectoryDetails(
  solution: LaunchSolution,
  seconds = 1.25,
): SampledTrajectory {
  const w = { ...solution.angularVelocity };
  const state: SimState = {
    x: solution.originMm.x / 1000, y: solution.originMm.y / 1000,
    z: solution.originMm.z / 1000, vx: solution.velocityMm.x / 1000,
    vy: solution.velocityMm.y / 1000, vz: solution.velocityMm.z / 1000,
  };
  const points: Array<{ x: number; y: number; z: number }> = [];
  const tableImpacts: Array<{ x: number; y: number; z: number }> = [];
  const dt = 1 / 240;
  let bounces = 0;
  for (let t = 0; t < seconds && state.y > 0 && state.x < 3.35 && Math.abs(state.z) < 2.2; t += dt) {
    const previousY = state.y;
    advanceSimulation(state, w, dt);
    if (
      bounces < 3 && state.vy < 0 && previousY >= TABLE_CONTACT_Y && state.y <= TABLE_CONTACT_Y &&
      state.x >= 0.02 && state.x <= 2.72 && state.z >= -1.505 && state.z <= -0.02
    ) {
      const impact = Math.abs(state.vy);
      const restitution = Math.max(0.55, Math.min(0.90, 0.93 - 0.02 * impact));
      const contactVx = state.vx + w.z * BALL_RADIUS;
      const contactVz = state.vz - w.x * BALL_RADIUS;
      const contactSpeed = Math.hypot(contactVx, contactVz);
      let impulseX = 0;
      let impulseZ = 0;
      if (contactSpeed > 1e-6) {
        const stickingImpulse = 0.4 * BALL_MASS * contactSpeed;
        const normalImpulse = BALL_MASS * (1 + restitution) * impact;
        const impulseMagnitude = Math.min(stickingImpulse, BALL_TABLE_FRICTION * normalImpulse);
        impulseX = -impulseMagnitude * contactVx / contactSpeed;
        impulseZ = -impulseMagnitude * contactVz / contactSpeed;
      }
      state.y = TABLE_CONTACT_Y;
      state.vy = impact * restitution;
      state.vx += impulseX / BALL_MASS;
      state.vz += impulseZ / BALL_MASS;
      w.x -= BALL_RADIUS * impulseZ / BALL_INERTIA;
      w.z += BALL_RADIUS * impulseX / BALL_INERTIA;
      tableImpacts.push({ x: state.x * 1000, y: TABLE_CONTACT_Y * 1000, z: state.z * 1000 });
      bounces += 1;
    }
    points.push({ x: state.x * 1000, y: state.y * 1000, z: state.z * 1000 });
  }
  return { points, tableImpacts };
}

export function sampleTrajectory(
  solution: LaunchSolution,
  seconds = 1.25,
): Array<{ x: number; y: number; z: number }> {
  return sampleTrajectoryDetails(solution, seconds).points;
}

//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
