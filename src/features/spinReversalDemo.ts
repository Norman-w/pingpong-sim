//#region 导入/依赖
import * as THREE from 'three';
import {
  getPreset,
  profileForSpinReversalMode,
  simulateSpinReversal,
  solveLaunch,
  TABLE_IMPACT_PROFILES,
  type LaunchSolution,
  type SpinReversalResult,
  type TableImpactProfile,
} from '../serveMachine';
//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
export type SpinReversalMode = 'standard' | 'critical' | 'reversal';

export interface SpinReversalRun {
  solution: LaunchSolution;
  standard: SpinReversalResult;
  comparison: SpinReversalResult;
  comparisonProfile: TableImpactProfile;
}
//#endregion

//#region 私有成员
function comparisonProfileForMode(mode: SpinReversalMode): TableImpactProfile {
  return mode === 'standard'
    ? TABLE_IMPACT_PROFILES['low-grip']
    : profileForSpinReversalMode(mode);
}

function spinSolution(): LaunchSolution {
  const preset = getPreset('serve-back-short');
  return solveLaunch(preset, {
    strength: 1,
    cadence: preset.cadence,
    targetLane: 'middle',
    randomize: false,
    playerLevel: 'club',
  });
}

function spinOrigin(solution: LaunchSolution, zOffsetMm: number): {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
} {
  return {
    x: solution.originMm.x / 1000,
    y: solution.originMm.y / 1000,
    z: solution.originMm.z / 1000 + zOffsetMm / 1000,
    vx: solution.velocityMm.x / 1000,
    vy: solution.velocityMm.y / 1000,
    vz: solution.velocityMm.z / 1000,
  };
}

function spinSenseLabel(sense: SpinReversalResult['finalSense']): string {
  if (sense === 'topspin') return '上旋';
  if (sense === 'backspin') return '下旋';
  return '接近不转';
}

function spinRpmLabel(rpm: number): string {
  if (Math.abs(rpm) <= 25) return '接近不转';
  return `${rpm > 0 ? '上旋' : '下旋'} ${Math.abs(Math.round(rpm))} rpm`;
}

function spinImpactSummary(result: SpinReversalResult): string {
  if (result.impacts.length === 0) return '未检测到有效落台';
  return result.impacts.map(impact =>
    `第${impact.bounceIndex}跳 ${spinRpmLabel(impact.beforeTopSpinRpm)}→${spinRpmLabel(impact.afterTopSpinRpm)}`,
  ).join('；');
}
//#endregion

//#region 公开 API
export function createSpinReversalRun(mode: SpinReversalMode): SpinReversalRun {
  const solution = spinSolution();
  const comparisonProfile = comparisonProfileForMode(mode);
  return {
    solution,
    standard: simulateSpinReversal({
      origin: spinOrigin(solution, -180),
      angularVelocity: solution.angularVelocity,
      tableProfile: TABLE_IMPACT_PROFILES.standard,
    }),
    comparison: simulateSpinReversal({
      origin: spinOrigin(solution, 180),
      angularVelocity: solution.angularVelocity,
      tableProfile: comparisonProfile,
    }),
    comparisonProfile,
  };
}

export function spinOriginFromSolution(solution: LaunchSolution, zOffsetMm: number): {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
} {
  return spinOrigin(solution, zOffsetMm);
}

export function spinMetricsHtml(run: SpinReversalRun): string {
  return `<strong>同一个初始下旋：${spinRpmLabel(run.standard.initialTopSpinRpm)}</strong><br>` +
    `标准条件：${spinImpactSummary(run.standard)} → ${spinSenseLabel(run.standard.finalSense)}<br>` +
    `${run.comparisonProfile.label}：${spinImpactSummary(run.comparison)} → ${spinSenseLabel(run.comparison.finalSense)}<br>` +
    `<span class="spin-caveat">判定：接球方垂直反胶拍面测试，${run.comparison.receiverTrend === 'upward' ? '更容易上蹿' : run.comparison.receiverTrend === 'downward' ? '更容易下扎' : '趋势接近中性'}。</span>`;
}

export function spinOverlayStatus(run: SpinReversalRun): string {
  const comparisonOutcome = run.comparison.outcome === 'reversed'
    ? '第二跳过零变成上旋'
    : run.comparison.outcome === 'near-zero'
      ? '第二跳接近不转'
      : '第二跳仍是下旋';
  return `标准条件：第二跳后仍是下旋；${run.comparisonProfile.label}：${comparisonOutcome}。仅代表当前仿真参数。`;
}

export function buildSpinTrajectoryLines(run: SpinReversalRun): THREE.Line[] {
  const lines: Array<[SpinReversalResult, number]> = [
    [run.standard, 0x54d6ff],
    [run.comparison, 0xff5d73],
  ];
  return lines.map(([result, color]) => {
    const points = result.points.map(point => new THREE.Vector3(
      point.xMm,
      point.yMm,
      point.zMm,
    ));
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 }),
    );
  });
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
