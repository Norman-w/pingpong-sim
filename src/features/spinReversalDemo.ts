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
  const standardRpm = run.standard.impacts.at(-1)?.afterTopSpinRpm ?? 0;
  const comparisonRpm = run.comparison.impacts.at(-1)?.afterTopSpinRpm ?? 0;
  return `<strong>蓝色球（标准条件）</strong>：两次落台后仍是${spinSenseLabel(run.standard.finalSense)}<br>` +
    `<strong>红色球（${run.comparisonProfile.label}）</strong>：第二跳后${spinSenseLabel(run.comparison.finalSense)}<br>` +
    `<span class="spin-rpm-note">仿真读数：蓝 ${Math.round(standardRpm)} rpm · 红 ${comparisonRpm > 0 ? '+' : ''}${Math.round(comparisonRpm)} rpm</span><br>` +
    `<span class="spin-caveat">结论只对当前这组 3D 仿真条件成立。</span>`;
}

export function spinOverlayStatus(run: SpinReversalRun): string {
  const comparisonOutcome = run.comparison.outcome === 'reversed'
    ? '第二跳过零，变成上旋'
    : run.comparison.outcome === 'near-zero'
      ? '第二跳接近不转'
      : '第二跳仍是下旋';
  return `蓝色球：下旋减弱但没有反转；红色球：${comparisonOutcome}。只代表当前 3D 仿真条件。`;
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
