//#region 导入/依赖
import { type LaunchSolution } from './shotCatalog';
import {
  BALL_INERTIA,
  BALL_MASS,
  BALL_RADIUS,
  RPM_TO_RAD,
  TABLE_CONTACT_Y,
  TABLE_IMPACT_PROFILES,
  type TableImpactProfile,
  resolveTableImpactKinematics,
} from './tableImpact';
import { aerodynamicForces, integrateAerodynamicSpin } from './aerodynamics';
//#endregion

//#region 常量/配置
export const BALL_AREA = Math.PI * BALL_RADIUS ** 2;
export const BALL_VOLUME = (4 / 3) * Math.PI * BALL_RADIUS ** 3;
export { BALL_INERTIA, BALL_MASS, BALL_RADIUS, RPM_TO_RAD, TABLE_CONTACT_Y } from './tableImpact';
export const BALL_TABLE_FRICTION = TABLE_IMPACT_PROFILES.standard.frictionCoefficient;
const GRAVITY = 9.81;
export const NET_X = 1.370;
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
  const aero = aerodynamicForces(
    { x: state.vx, y: state.vy, z: state.vz },
    angularVelocity,
  );
  const ax = aero.force.x / BALL_MASS;
  const ay = -GRAVITY + aero.force.y / BALL_MASS;
  const az = aero.force.z / BALL_MASS;
  state.vx += ax * dt; state.vy += ay * dt; state.vz += az * dt;
  state.x += state.vx * dt; state.y += state.vy * dt; state.z += state.vz * dt;
}

export function simulateToTarget(
  origin: SimState,
  angularVelocity: { x: number; y: number; z: number },
  targetX: number,
): SimResult {
  const state = { ...origin };
  const w = { ...angularVelocity };
  const dt = 1 / 480;
  let time = 0;
  let netY = origin.y;
  let recordedNet = false;

  while (state.x < targetX && time < 1.5) {
    advanceSimulation(state, w, dt);
    integrateAerodynamicSpin(w, { x: state.vx, y: state.vy, z: state.vz }, dt);
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
  tableProfile: TableImpactProfile = TABLE_IMPACT_PROFILES.standard,
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
    integrateAerodynamicSpin(w, { x: state.vx, y: state.vy, z: state.vz }, dt);
    if (!sawNet && hits.length > 0 && state.x >= NET_X) { netY = state.y; sawNet = true; }
    if (
      state.vy < 0 && previousY >= TABLE_CONTACT_Y && state.y <= TABLE_CONTACT_Y &&
      state.x >= 0.02 && state.x <= 2.72 && state.z >= -1.505 && state.z <= -0.02
    ) {
      hits.push({ x: state.x, z: state.z, time: t });
      const impact = resolveTableImpactKinematics({
        linearVelocity: { x: state.vx, y: state.vy, z: state.vz },
        angularVelocity: w,
      }, tableProfile);
      state.y = TABLE_CONTACT_Y;
      state.vx = impact.kinematics.linearVelocity.x;
      state.vy = impact.kinematics.linearVelocity.y;
      state.vz = impact.kinematics.linearVelocity.z;
      w.x = impact.kinematics.angularVelocity.x;
      w.z = impact.kinematics.angularVelocity.z;
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
  const w = { ...angularVelocity };
  let netY = origin.y;
  let sawNet = false;
  const dt = 1 / 480;
  for (let t = 0; t < 2 && state.x < 4.2 && state.y > 0; t += dt) {
    const previousY = state.y;
    advanceSimulation(state, w, dt);
    integrateAerodynamicSpin(w, { x: state.vx, y: state.vy, z: state.vz }, dt);
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
  tableProfile: TableImpactProfile = TABLE_IMPACT_PROFILES.standard,
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
    integrateAerodynamicSpin(w, { x: state.vx, y: state.vy, z: state.vz }, dt);
    if (
      bounces < 3 && state.vy < 0 && previousY >= TABLE_CONTACT_Y && state.y <= TABLE_CONTACT_Y &&
      state.x >= 0.02 && state.x <= 2.72 && state.z >= -1.505 && state.z <= -0.02
    ) {
      const impact = resolveTableImpactKinematics({
        linearVelocity: { x: state.vx, y: state.vy, z: state.vz },
        angularVelocity: w,
      }, tableProfile);
      state.y = TABLE_CONTACT_Y;
      state.vx = impact.kinematics.linearVelocity.x;
      state.vy = impact.kinematics.linearVelocity.y;
      state.vz = impact.kinematics.linearVelocity.z;
      w.x = impact.kinematics.angularVelocity.x;
      w.z = impact.kinematics.angularVelocity.z;
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
