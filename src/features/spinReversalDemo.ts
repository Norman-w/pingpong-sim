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
  standardSolution: LaunchSolution;
  comparisonSolution: LaunchSolution;
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

function spinSolution(topSpinRpm = -3200): LaunchSolution {
  const preset = { ...getPreset('serve-back-short'), topRpm: topSpinRpm };
  return solveLaunch(preset, {
    strength: 1,
    cadence: preset.cadence,
    targetLane: 'middle',
    randomize: false,
    playerLevel: 'club',
  });
}

function comparisonTopSpinRpm(mode: SpinReversalMode): number {
  if (mode === 'critical') return -1980;
  if (mode === 'reversal') return -1860;
  return -3200;
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

function comparisonDisplayLabel(profile: TableImpactProfile): string {
  if (profile.id === 'critical') return '下旋调小';
  if (profile.id === 'high-grip') return '过零这一档';
  return '常规下旋';
}
//#endregion

//#region 公开 API
export function createSpinReversalRun(mode: SpinReversalMode): SpinReversalRun {
  const standardSolution = spinSolution(-3200);
  const comparisonSolution = spinSolution(comparisonTopSpinRpm(mode));
  const comparisonProfile = comparisonProfileForMode(mode);
  return {
    // Kept as the baseline alias for existing consumers. New callers should
    // use the two explicit solutions below because critical/reversal are
    // different incoming-spin trials under the same physical table model.
    solution: standardSolution,
    standardSolution,
    comparisonSolution,
    standard: simulateSpinReversal({
      origin: spinOrigin(standardSolution, -180),
      angularVelocity: standardSolution.angularVelocity,
      tableProfile: TABLE_IMPACT_PROFILES.standard,
    }),
    comparison: simulateSpinReversal({
      origin: spinOrigin(comparisonSolution, 180),
      angularVelocity: comparisonSolution.angularVelocity,
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
  return `<strong>蓝色球（常规下旋）</strong>：两次落台后仍是${spinSenseLabel(run.standard.finalSense)}<br>` +
    `<strong>红色球（${comparisonDisplayLabel(run.comparisonProfile)}）</strong>：第二跳后${spinSenseLabel(run.comparison.finalSense)}<br>` +
    `<span class="spin-rpm-note">仿真读数：蓝 ${Math.round(standardRpm)} rpm · 红 ${comparisonRpm > 0 ? '+' : ''}${Math.round(comparisonRpm)} rpm</span><br>` +
    `<span class="spin-caveat">蓝红只差出手时的下旋大小，球台条件不换。</span><br>` +
    `<span class="spin-caveat">球速、落台角度和起手转速，都会影响最后的结果。</span><br>` +
    `<span class="spin-caveat">球面彩色分区跟着球一起转，方便看清自转方向。</span><br>` +
    `<span class="spin-caveat">这只是当前这组条件下的仿真结果。</span>`;
}

/** Keep the recording card readable at a glance; detailed source ranges stay
 * in the normal simulation panel and the physics audit document. */
export function spinRecordingMetricsHtml(run: SpinReversalRun): string {
  const standardRpm = run.standard.impacts.at(-1)?.afterTopSpinRpm ?? 0;
  const comparisonRpm = run.comparison.impacts.at(-1)?.afterTopSpinRpm ?? 0;
  const comparisonLabel = comparisonDisplayLabel(run.comparisonProfile);
  const focus = run.comparisonProfile.id === 'critical'
    ? { tone: 'critical', label: '重点看红球 · 临界下旋：第二跳后接近不转' }
    : run.comparisonProfile.id === 'high-grip'
      ? { tone: 'reversal', label: '重点看红球 · 过零条件：第二跳后显示上旋' }
      : { tone: 'standard', label: '重点看蓝球 · 标准条件：两次碰台后仍是下旋' };
  const standardClass = focus.tone === 'standard' ? ' focus-line' : '';
  const comparisonClass = focus.tone === 'standard' ? '' : ' focus-line';
  const outcome = run.comparison.outcome === 'reversed'
    ? '第二跳后过零，变成上旋'
    : run.comparison.outcome === 'near-zero'
      ? '第二跳后接近不转'
      : '第二跳后仍是下旋';
  return `<div class="recording-focus ${focus.tone}">${focus.label}</div>` +
    `<div class="recording-result-line${standardClass}"><span class="recording-ball blue">蓝球</span> 标准条件：两次落台后仍是下旋</div>` +
    `<div class="recording-result-line${comparisonClass}"><span class="recording-ball red">红球</span> ${comparisonLabel}：${outcome}</div>` +
    `<div class="recording-rpm">仿真计算值：蓝 ${Math.round(standardRpm)} rpm · 红 ${comparisonRpm > 0 ? '+' : ''}${Math.round(comparisonRpm)} rpm</div>` +
    `<div class="recording-note">球台一样，红球只调了出手时的下旋。</div>`;
}

export function spinOverlayStatus(run: SpinReversalRun): string {
  const comparisonOutcome = run.comparison.outcome === 'reversed'
    ? '第二跳过零，变成上旋'
    : run.comparison.outcome === 'near-zero'
      ? '第二跳接近不转'
      : '第二跳仍是下旋';
  return `蓝球：标准条件·下旋减弱；红球：${comparisonOutcome}。`;
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
