//#region 导入/依赖
import {
  advanceSimulation,
  type SimState,
} from './trajectorySim';
import {
  applyAirSpinDamping,
  classifySpin,
  resolveTableImpactKinematics,
  TABLE_CONTACT_Y,
  TABLE_IMPACT_PROFILES,
  topSpinRpmFromAngularZ,
  type SpinSense,
  type TableImpactEvent,
  type TableImpactProfile,
} from './tableImpact';
//#endregion

//#region 常量/配置
const SIMULATION_DT = 1 / 480;
const TABLE_MIN_X = 0.020;
const TABLE_MAX_X = 2.720;
const TABLE_MIN_Z = -1.505;
const TABLE_MAX_Z = -0.020;
const POST_LAST_IMPACT_SECONDS = 0.16;
//#endregion

//#region 模型/类型
export type ReceiverVerticalTrend = 'upward' | 'downward' | 'neutral';
export type SpinReversalOutcome = 'reversed' | 'near-zero' | 'weakened';

export interface SpinReversalConfig {
  origin: SimState;
  angularVelocity: { x: number; y: number; z: number };
  tableProfile: TableImpactProfile;
  maxSeconds?: number;
  maxImpacts?: number;
}

export interface SpinReversalImpact extends TableImpactEvent {
  bounceIndex: number;
  timeMs: number;
  xMm: number;
  zMm: number;
}

export interface SpinTrajectoryPoint {
  xMm: number;
  yMm: number;
  zMm: number;
  timeMs: number;
}

export interface SpinReversalResult {
  points: SpinTrajectoryPoint[];
  impacts: SpinReversalImpact[];
  initialTopSpinRpm: number;
  finalTopSpinRpm: number;
  initialSense: SpinSense;
  finalSense: SpinSense;
  outcome: SpinReversalOutcome;
  receiverTrend: ReceiverVerticalTrend;
}
//#endregion

//#region 私有成员
function receiverTrendForSpin(sense: SpinSense): ReceiverVerticalTrend {
  // Operational test only: a vertical, non-active inverted-rubber face is
  // held constant, so the vertical friction tendency is what is compared.
  if (sense === 'topspin') return 'upward';
  if (sense === 'backspin') return 'downward';
  return 'neutral';
}

function isTableImpact(state: SimState, previousY: number): boolean {
  return state.vy < 0 && previousY >= TABLE_CONTACT_Y && state.y <= TABLE_CONTACT_Y &&
    state.x >= TABLE_MIN_X && state.x <= TABLE_MAX_X &&
    state.z >= TABLE_MIN_Z && state.z <= TABLE_MAX_Z;
}

function toPoint(state: SimState, timeMs: number): SpinTrajectoryPoint {
  return { xMm: state.x * 1000, yMm: state.y * 1000, zMm: state.z * 1000, timeMs };
}
//#endregion

//#region 公开 API
export function simulateSpinReversal(config: SpinReversalConfig): SpinReversalResult {
  const state = { ...config.origin };
  const angularVelocity = { ...config.angularVelocity };
  const maxSeconds = config.maxSeconds ?? 1.6;
  const maxImpacts = config.maxImpacts ?? 2;
  const initialTopSpinRpm = topSpinRpmFromAngularZ(angularVelocity.z);
  const points: SpinTrajectoryPoint[] = [toPoint(state, 0)];
  const impacts: SpinReversalImpact[] = [];
  let time = 0;
  let stopAfter = Number.POSITIVE_INFINITY;

  for (let step = 0; step < maxSeconds / SIMULATION_DT; step += 1) {
    const previousY = state.y;
    advanceSimulation(state, angularVelocity, SIMULATION_DT);
    applyAirSpinDamping(angularVelocity, SIMULATION_DT);
    time += SIMULATION_DT;

    if (impacts.length < maxImpacts && isTableImpact(state, previousY)) {
      const resolved = resolveTableImpactKinematics({
        linearVelocity: { x: state.vx, y: state.vy, z: state.vz },
        angularVelocity,
      }, config.tableProfile);
      state.y = TABLE_CONTACT_Y;
      state.vx = resolved.kinematics.linearVelocity.x;
      state.vy = resolved.kinematics.linearVelocity.y;
      state.vz = resolved.kinematics.linearVelocity.z;
      angularVelocity.x = resolved.kinematics.angularVelocity.x;
      angularVelocity.y = resolved.kinematics.angularVelocity.y;
      angularVelocity.z = resolved.kinematics.angularVelocity.z;
      impacts.push({
        ...resolved.event,
        bounceIndex: impacts.length + 1,
        timeMs: time * 1000,
        xMm: state.x * 1000,
        zMm: state.z * 1000,
      });
      if (impacts.length >= maxImpacts) stopAfter = time + POST_LAST_IMPACT_SECONDS;
    }

    points.push(toPoint(state, time * 1000));
    if (time >= stopAfter || state.y <= 0 || state.x > 3.35 || Math.abs(state.z) > 2.2) break;
  }

  const initialSense = classifySpin(initialTopSpinRpm);
  const finalTopSpinRpm = impacts.at(-1)?.afterTopSpinRpm ?? initialTopSpinRpm;
  const finalSense = classifySpin(finalTopSpinRpm);
  const outcome: SpinReversalOutcome = impacts.some(impact => impact.spinReversed)
    ? 'reversed'
    : finalSense === 'neutral' || impacts.some(impact => impact.afterSense === 'neutral')
      ? 'near-zero'
      : 'weakened';
  return {
    points,
    impacts,
    initialTopSpinRpm,
    finalTopSpinRpm,
    initialSense,
    finalSense,
    outcome,
    receiverTrend: receiverTrendForSpin(finalSense),
  };
}

export function profileForSpinReversalMode(mode: 'standard' | 'critical' | 'reversal'): TableImpactProfile {
  if (mode === 'critical') return TABLE_IMPACT_PROFILES.critical;
  if (mode === 'reversal') return TABLE_IMPACT_PROFILES['high-grip'];
  return TABLE_IMPACT_PROFILES.standard;
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
