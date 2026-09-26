import * as THREE from 'three';
import {
  buildReceiverReachModel,
  capabilityForLevel,
} from '../src/domain/lobProcessability';
import {
  createLobSessionFields,
  initLobWindowTeaching,
} from '../src/features/lobWindowTeaching';
import {
  beginNextContinuousDemoCycle,
  clearDemoPlaybackPlan,
  configureFollowOnlyDemoPlayback,
  consumeLiveDemoPass,
  takeSlowFollowPlaylist,
} from '../src/features/trackingDemoPlayback';
import { performTopicDemoExit } from '../src/features/topicDemo';
import {
  getPreset,
  profileForSpinReversalMode,
  sampleTrajectoryDetails,
  simulateSpinReversal,
  solveLaunch,
  type TargetLane,
} from '../src/serveMachine';
import {
  resolveTableImpactKinematics,
  TABLE_IMPACT_PROFILES,
  tableRestitution,
} from '../src/domain/tableImpact';
import {
  aerodynamicCoefficients,
  aerodynamicForces,
  integrateAerodynamicSpin,
} from '../src/domain/aerodynamics';
import type { TrackingSession } from '../src/features/trackingTypes';

type TestCase = { name: string; run: () => void | Promise<void> };
const tests: TestCase[] = [];

function test(name: string, run: TestCase['run']): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertArrayEqual<T>(actual: T[], expected: T[], message: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

function assertNear(actual: number, expected: number, tolerance: number, message: string): void {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

test('儿童放高球错过窗口 A 后切换窗口 B，并保持视线跟球后退', () => {
  const childLevel = capabilityForLevel('beginner');
  const childModel = buildReceiverReachModel(950, {
    moveSpeedMmPerSec: 1200,
    reachAllowanceMm: 220,
    reactionMs: 350,
    ...childLevel,
  });
  let pinnedPoint: THREE.Vector3 | null = null;
  let failureReason = '';
  let guidePoint: THREE.Vector3 | null = null;
  let guideState = '';
  const receiveStance = {
    viewHeightMm: 950,
    stanceMode: 'auto',
    autoDepthOverrideX: null as number | null,
    autoContactZ: -762.5,
    currentReceiverProfile: () => ({
      moveSpeedMmPerSec: 1200,
      reachAllowanceMm: 220,
      reactionMs: 350,
    }),
    effectiveStancePose: () => ({ x: 4300, z: -762.5, label: '远台' }),
    placeContactGuide: (point: THREE.Vector3) => { guidePoint = point.clone(); },
    setContactGuideState: (state: string) => { guideState = state; },
    pinMissedPreferredMarker: (point: THREE.Vector3) => { pinnedPoint = point.clone(); },
    showReceiveFailure: (reason: string) => { failureReason = reason; },
  };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(4300, 950, -762.5);
  const teaching = initLobWindowTeaching({
    TABLE_TOP_Y: 785,
    TABLE_LENGTH: 2740,
    BALL_RADIUS: 20,
    receiveStance: receiveStance as never,
    camera,
    getReceiverLevel: () => 'beginner',
    setTrackingStatus: () => undefined,
  });
  const session = {
    ...createLobSessionFields(),
    ball: { tableImpacts: 1 },
    phase: 'follow-launch',
    phaseStartedAt: 0,
    previousVy: 1.8,
  } as unknown as TrackingSession;

  teaching.updateLobWindowATeaching(
    session,
    new THREE.Vector3(2250, 960, -762.5),
    { x: 1.1, y: 1.8, z: 0 },
    1000,
    true,
    1,
  );
  assert(session.lobEnteredWindowA, '球应先进入上升窗口 A');

  teaching.updateLobWindowATeaching(
    session,
    new THREE.Vector3(2320, childModel.jumpContactYMm + 40, -762.5),
    { x: 1.0, y: 1.0, z: 0 },
    1200,
    true,
    1,
  );

  assert(session.lobWindowAMissSignaled, '窗口 A 错过提示应只被挂起一次');
  assert(session.lobPreferWindowB, '错过 A 后必须进入窗口 B 策略');
  assert(pinnedPoint, '应钉住橙色窗口 A 错过标记');
  assert(guidePoint, '应生成下降窗口 B 的青色建议点');
  assertEqual(guideState, 'hittable', '窗口 B 建议点应标记为可处理');
  assertEqual(session.phase, 'follow-contact', '错过 A 后不得回看发球机');
  assert(receiveStance.autoDepthOverrideX !== null, '自动身位应后退等待窗口 B');
  assert(failureReason.includes('错过第一合理处理点'), '应显示窗口 A 的明确失败原因');
});

test('儿童放高球连续播放保持同球 2 遍满速/正常 + 2 遍慢放并能重置下一轮', () => {
  const views = [
    { checked: true, dataset: { replayView: 'follow' } },
    { checked: true, dataset: { replayView: 'referee' } },
    { checked: true, dataset: { replayView: 'god' } },
  ];
  const originalDocument = globalThis.document;
  globalThis.document = { querySelectorAll: () => views } as unknown as Document;
  try {
    configureFollowOnlyDemoPlayback({ livePasses: 2, slowPasses: 2, slowSpeed: 0.2, continuous: true }, {
      selectFollowOnly: () => views.forEach(view => { view.checked = view.dataset.replayView === 'follow'; }),
      setReplaySpeed: () => undefined,
      enableAutoReplay: () => undefined,
    });
    assertArrayEqual(views.map(view => view.checked), [true, false, false], '专题应强制只选跟球视角');
    assertEqual(consumeLiveDemoPass(), 'start-replay', '首遍实录后应进入同球回放');
    const firstCycle = takeSlowFollowPlaylist();
    assert(firstCycle, '第一轮应生成回放列表');
    assertArrayEqual(firstCycle.views, ['follow', 'follow', 'follow'], '剩余三遍都必须使用跟球视角');
    assertArrayEqual(firstCycle.speeds, [1, 0.2, 0.2], '应依次满速复现一次、慢放两次');

    beginNextContinuousDemoCycle();
    assertEqual(consumeLiveDemoPass(), 'start-replay', '连续模式下一球应重新开始完整播放计划');
    const secondCycle = takeSlowFollowPlaylist();
    assert(secondCycle, '第二轮应再次生成回放列表');
    assertArrayEqual(secondCycle.speeds, [1, 0.2, 0.2], '下一轮速度计划不得衰减或丢失');

    clearDemoPlaybackPlan();
    assertArrayEqual(views.map(view => view.checked), [true, true, true], '专题退出后应恢复默认全选视角');
  } finally {
    globalThis.document = originalDocument;
  }
});

test('专题退出恢复跟球、播放计划、落点锁定、机器与窗口指示', () => {
  const calls: string[] = [];
  performTopicDemoExit({
    stopTracking: reset => calls.push(`stop:${reset}`),
    clearPlaybackPlan: () => calls.push('clear-playback'),
    unlockTargetDepth: () => calls.push('unlock-depth'),
    showMachine: () => calls.push('show-machine'),
    syncIndicators: () => calls.push('sync-indicators'),
  });
  assertArrayEqual(calls, [
    'stop:true',
    'clear-playback',
    'unlock-depth',
    'show-machine',
    'sync-indicators',
  ], '退出专题必须完整恢复五项状态');
});

test('儿童放高球在全深度和三条线路只落接球台一次，下一跳必须出台', () => {
  const preset = getPreset('lob');
  const lanes: TargetLane[] = ['forehand', 'middle', 'backhand'];
  const depths = [1850, 2300, 2680];
  for (const targetLane of lanes) {
    for (const targetDepthOverrideMm of depths) {
      const solution = solveLaunch(preset, {
        strength: 1,
        cadence: preset.cadence,
        targetLane,
        targetDepthOverrideMm,
        randomize: false,
        playerLevel: 'club',
      });
      const trajectory = sampleTrajectoryDetails(solution, 3);
      assertEqual(solution.quality?.outcome, 'in', `${targetLane}/${targetDepthOverrideMm} 首次落台必须有效`);
      assertEqual(trajectory.tableImpacts.length, 1, `${targetLane}/${targetDepthOverrideMm} 不得在球台二跳`);
      const first = trajectory.tableImpacts[0];
      assert(first.x > 1370 && first.x <= 2720, `${targetLane}/${targetDepthOverrideMm} 应落在接球方台面`);
    }
  }
});

function spinTopicResult(mode: 'standard' | 'critical' | 'reversal') {
  const preset = {
    ...getPreset('serve-back-short'),
    // The comparison is a controlled initial-spin sweep under the same
    // source-backed table law. These are launch settings, not friction
    // coefficients: the table model remains μ=0.25 for all three cases.
    topRpm: mode === 'critical' ? -1980 : mode === 'reversal' ? -1860 : -3200,
  };
  const solution = solveLaunch(preset, {
    strength: 1,
    cadence: preset.cadence,
    targetLane: 'middle',
    randomize: false,
    playerLevel: 'club',
  });
  return simulateSpinReversal({
    origin: {
      x: solution.originMm.x / 1000,
      y: solution.originMm.y / 1000,
      z: solution.originMm.z / 1000,
      vx: solution.velocityMm.x / 1000,
      vy: solution.velocityMm.y / 1000,
      vz: solution.velocityMm.z / 1000,
    },
    angularVelocity: solution.angularVelocity,
    tableProfile: profileForSpinReversalMode(mode),
  });
}

test('旋转专题标准条件只减弱，不能把下旋标签夸大成反转', () => {
  const result = spinTopicResult('standard');
  assertEqual(result.initialSense, 'backspin', '出手状态必须是下旋');
  assertEqual(result.impacts.length, 2, '发球应完成第一跳和第二跳');
  assert(!result.impacts.some(impact => impact.spinReversed), '标准条件不应发生反转');
  assertEqual(result.finalSense, 'backspin', '标准条件第二跳后仍应是下旋');
  assert(Math.abs(result.finalTopSpinRpm) < Math.abs(result.initialTopSpinRpm), '标准条件下旋量应减弱');
});

test('旋转专题临界条件会经过接近不转的过零门槛', () => {
  const result = spinTopicResult('critical');
  assert(result.impacts.some(impact => impact.afterSense === 'neutral'), '临界条件应出现接近不转的读数');
  assertEqual(result.outcome, 'near-zero', '临界条件不能直接标记成反转');
});

test('旋转专题过零初始旋转条件第二跳可以过零并改变接球趋势', () => {
  const result = spinTopicResult('reversal');
  assert(result.impacts.some(impact => impact.spinReversed), '过零初始旋转条件第二跳应过零');
  assertEqual(result.finalSense, 'topspin', '反转后的最终状态应标为上旋');
  assertEqual(result.receiverTrend, 'upward', '上旋在垂直反胶拍面测试中应显示上蹿趋势');
});

test('台面冲量只处理下落碰撞，不会吞掉向上的竖直速度', () => {
  const result = resolveTableImpactKinematics({
    linearVelocity: { x: 1.2, y: 0.8, z: -0.4 },
    angularVelocity: { x: 0, y: 0, z: 120 },
  }, TABLE_IMPACT_PROFILES.standard);
  assertEqual(result.kinematics.linearVelocity.y, 0.8, '非下落输入应保留竖直速度');
  assertEqual(result.event.normalImpulse, 0, '非下落输入不应产生法向冲量');
  assertEqual(result.event.tangentialImpulse, 0, '无正压力时不应产生切向摩擦冲量');
});

test('分析轨迹的空气旋转阻尼会减弱角速度但不改变旋转方向', () => {
  const angularVelocity = { x: 0, y: 0, z: 100 };
  integrateAerodynamicSpin(angularVelocity, { x: 5, y: 0, z: 0 }, 1);
  assert(angularVelocity.z > 0 && angularVelocity.z < 100, '空气阻尼应减弱角速度且不反向');
});

test('空气动力使用来源 CFD 表并在来源域外显式夹值', () => {
  const coefficients = aerodynamicCoefficients(5, 45 * 2 * Math.PI);
  assertNear(coefficients.dragCoefficient, 0.577, 1e-12, '5 m/s、45 rps 的阻力系数应来自 CFD 表');
  assertNear(coefficients.magnusCoefficient, 0.089, 1e-12, '5 m/s、45 rps 的马格努斯系数应来自 CFD 表');
  assertNear(coefficients.fluidTorqueCoefficient, 0.0181, 1e-12, '5 m/s、45 rps 的流体转矩系数应来自 CFD 表');
  assert(!coefficients.clampedToSourceDomain, '来源表网格内不应标记夹值');
  const outside = aerodynamicCoefficients(1, 5 * 2 * Math.PI);
  assert(outside.clampedToSourceDomain, '来源表网格外必须显式标记夹值');
});

test('三维空气力方向和台面恢复系数遵守物理符号', () => {
  const aero = aerodynamicForces({ x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 45 * 2 * Math.PI });
  assert(aero.force.x < 0, '阻力必须反向于平动速度');
  assert(aero.force.y > 0, 'ω×v 的三维马格努斯力方向必须为正 Y');
  assert(aero.torque.z < 0, '流体转矩必须反向于 Z 轴角速度');
  assertNear(tableRestitution(5), 0.88, 1e-12, '台面恢复系数应使用速度相关来源公式');
});

export async function runLobTopicRegressionSuite(): Promise<void> {
  let failures = 0;
  for (const item of tests) {
    try {
      await item.run();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${item.name}`);
      console.error(error);
    }
  }
  if (failures > 0) throw new Error(`${failures} 项放高球专题回归失败`);
  console.log(`\n${tests.length} 项放高球专题回归全部通过`);
}
