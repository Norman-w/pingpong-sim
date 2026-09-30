//#region 导入/依赖
import { createIcons, MousePointer2, ArrowDown, X, Wrench, Bot, Eye, FlaskConical, BarChart3, Minus, Play } from 'lucide';
import { createSceneBootstrap } from './scene/sceneBootstrap';
import { initBallVisuals } from './scene/ballVisuals';
import { loadSceneStls } from './scene/stlLoader';
import { initWindowManager } from './ui/windowManager';
import { init as initPhysics, getBalls, removeBall, step as physicsStep, syncMeshes, getBallCount, type RapierBall } from './physics';
import { SHOT_PRESETS } from './serveMachine';
import { initReceiveStance } from './features/receiveStance';
import { initMachineUi, type MachineUiApi } from './features/machineUi';
import { initTrackingReplay, type TrackingReplayApi } from './features/trackingReplay';
import { initTrackingDemo, type TrackingDemoApi } from './features/trackingDemo';
import { initTopicDemo, type TopicDemoApi, type DemoId } from './features/topicDemo';
import {
  initRecordingCamera,
  RECORDING_CAMERA_CYCLE_SECONDS,
  type RecordingCameraPhase,
  type RecordingCameraApi,
} from './features/recordingCamera';
import { initRecordingEffects, type RecordingEffectsApi } from './features/recordingEffects';
import { TABLE_CONTACT_Y } from './domain/tableImpact';

//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
//#endregion
//#region 私有成员
createIcons({ icons: { MousePointer2, ArrowDown, X, Wrench, Bot, Eye, FlaskConical, BarChart3, Minus, Play } });

let machineUiApi!: MachineUiApi;
let trackingReplayApi!: TrackingReplayApi;
let trackingDemoApi!: TrackingDemoApi;
let topicDemoApi!: TopicDemoApi;

const { syncWindowIndicators } = initWindowManager({
  isMachineActive: () => machineUiApi?.machineRunning ?? false,
  isTrackingActive: () => trackingDemoApi?.isTrackingEnabled() ?? false,
  isDemoActive: () => topicDemoApi?.isDemoActive() ?? false,
});

const {
  canvas: c,
  scene,
  camera,
  renderer,
  controls,
  TABLE_TOP_Y,
  TABLE_LENGTH,
  TABLE_CENTER_X,
  TABLE_CENTER_Z,
  VENUE_WIDTH,
} = createSceneBootstrap();

const {
  bGeo,
  ballMaterial,
  machineBallMeta,
  setBallStyle,
  spawnPhysicsBall,
  dropBall,
  clearBalls,
  setResetMachineOnClear,
  BALL_RADIUS,
} = initBallVisuals({ scene, tableTopY: TABLE_TOP_Y });

const receiveStance = initReceiveStance({
  scene,
  camera,
  controls,
  TABLE_TOP_Y,
  TABLE_CENTER_X,
  TABLE_CENTER_Z,
  VENUE_WIDTH,
  getActivePreset: () => machineUiApi.activePreset,
  getTargetLane: () => machineUiApi.targetLane,
  getIntendedLandingMm: () => ({
    x: machineUiApi.targetMarker.position.x,
    z: machineUiApi.targetMarker.position.z,
  }),
  isTrackingReplayMode: () => trackingReplayApi.isReplayMode(),
  getTrackingReplayMesh: () => trackingReplayApi.getReplayMesh(),
  isTrackingEnabled: () => trackingDemoApi.isTrackingEnabled(),
  onStartTrackingDemo: () => { void trackingDemoApi.startTrackingDemo(); },
});

machineUiApi = initMachineUi({
  scene,
  TABLE_TOP_Y,
  TABLE_CENTER_X,
  TABLE_CENTER_Z,
  BALL_RADIUS,
  spawnPhysicsBall,
  machineBallMeta,
  setBallStyle,
  syncWindowIndicators,
  stopTrackingDemo: () => trackingDemoApi.stopTrackingDemo(),
  clearDemoLines: () => topicDemoApi.clearDemoLines(),
  setActiveDemoItem: id => topicDemoApi.setActiveDemoItem(id as DemoId | null),
  exitTopicDemo: () => topicDemoApi?.exitTopicDemo(),
  refreshReplayCuePointsUi: () => trackingReplayApi?.refreshCuePointsUi(),
  receiveStance,
  isTrackingEnabled: () => trackingDemoApi?.isTrackingEnabled() ?? false,
  isTrackingReplayMode: () => trackingReplayApi?.isReplayMode() ?? false,
  isTrackingContinuous: () => trackingDemoApi?.isTrackingContinuous() ?? false,
  hasTrackingSession: () => trackingDemoApi?.hasTrackingSession() ?? false,
});

receiveStance.applyViewPreset();
receiveStance.updateContactGuide(false);
receiveStance.updateReceiverLevelDisplay();

trackingReplayApi = initTrackingReplay({
  scene,
  camera,
  controls,
  bGeo,
  ballMaterial,
  receiveStance,
  machineUiApi,
  syncWindowIndicators,
  onAutoReplayEnabled: () => trackingDemoApi.clearContinuousQueue(),
  onAutoReplayDisabled: () => trackingDemoApi.resumeContinuousIfActive(),
  onReplayStateChanged: () => trackingDemoApi.updateControlState(),
  onContinuousFollowDemoCycle: () => {
    // Next full-table lob target, then 1 live + 1× full-speed replay + 2× slow.
    machineUiApi.discardBallsExcept(null);
    machineUiApi.rollAndLockLobDemoTarget();
    trackingDemoApi.launchNextLiveDemoBall();
  },
});

let lastT = performance.now();
trackingDemoApi = initTrackingDemo({
  camera,
  controls,
  TABLE_TOP_Y,
  TABLE_LENGTH,
  BALL_RADIUS,
  receiveStance,
  machineUiApi,
  trackingReplay: trackingReplayApi,
  clearBalls,
  syncWindowIndicators,
  // After a feed, drop hitch time so the new ball is not stepped mid-arc.
  onLiveBallLaunched: () => { lastT = performance.now(); },
  isDemoActive: () => topicDemoApi?.isDemoActive() ?? false,
  exitTopicDemo: () => topicDemoApi?.exitTopicDemo(),
});

topicDemoApi = initTopicDemo({
  scene,
  TABLE_TOP_Y,
  BALL_RADIUS,
  spawnPhysicsBall,
  clearBalls,
  machineUiApi,
  receiveStance,
  trackingDemo: trackingDemoApi,
  trackingReplay: trackingReplayApi,
  syncWindowIndicators,
});

const recordingMode = new URLSearchParams(window.location.search).get('recording');
const requestedSpinMode = new URLSearchParams(window.location.search).get('mode');
const requestedRecordingFps = Number(new URLSearchParams(window.location.search).get('recordingFps'));
// The external capture target is 60 fps by default. A capped elapsed step
// keeps one long browser hitch from teleporting the ball across a whole
// capture interval; the browser can hold the previous canvas frame instead.
const recordingCaptureFps = Number.isFinite(requestedRecordingFps) && requestedRecordingFps >= 24 && requestedRecordingFps <= 60
  ? requestedRecordingFps
  : 60;
// Keep flight at real speed and slow only the short contact window. The
// collision resolver still receives the same physical velocities and applies
// the same impulses; this is presentation timing for the recording take.
const recordingContactSlowScale = 0.025;
// Begin the presentation ramp shortly before the measured table crossing so
// the ball reaches the very slow part at contact instead of jumping into it.
const recordingContactPreRollSeconds = 0.12;
const recordingContactRampInSeconds = 0.12;
const recordingContactHoldSeconds = 3.25;
const recordingContactRampOutSeconds = 0.45;
// A real contact frame is held for the force callout. This is presentation
// timing only; the resolver and its measured impulses are unchanged.
const recordingImpactPauseSeconds = 0.42;
type RecordingContactSlowPhase = 'idle' | 'ramp-in' | 'hold' | 'ramp-out';
const recordingSpinMode = requestedSpinMode === 'standard' || requestedSpinMode === 'critical' || requestedSpinMode === 'reversal'
  ? requestedSpinMode
  : 'reversal';
const recordingCamera: RecordingCameraApi | null = recordingMode === 'spin-reversal'
  ? initRecordingCamera({ camera, controls })
  : null;
const recordingEffects: RecordingEffectsApi | null = recordingMode === 'spin-reversal'
  ? initRecordingEffects({
    scene,
    tableTopY: TABLE_TOP_Y,
    focusBallLabel: recordingSpinMode === 'standard' ? '蓝球' : '红球',
  })
  : null;
const recordingDemoRestartSeconds = RECORDING_CAMERA_CYCLE_SECONDS;
const recordingPostSecondBounceSeconds = 0.28;
let recordingCycleElapsed = 0;
let recordingLaunchPending = false;
const recordingImpactCounts = new WeakMap<RapierBall, number>();
let recordingContactSlowPhase: RecordingContactSlowPhase = 'idle';
let recordingContactSlowPhaseElapsed = 0;
let recordingImpactPauseRemaining = 0;
let recordingContactSlowTriggerCounts = new WeakMap<RapierBall, number>();

const recordingPhaseLabels: Record<RecordingCameraPhase, string> = {
  establish: '开场 · 先看两球的起始状态',
  approach: '推进 · 跟到球网和落点区域',
  contact: '接触 · 看清落台和旋转变化',
  hold: '停留 · 给数据和结论留出时间',
};

async function startRecordingSpinCycle(): Promise<void> {
  if (recordingLaunchPending) return;
  recordingLaunchPending = true;
  recordingCycleElapsed = 0;
  recordingContactSlowPhase = 'idle';
  recordingContactSlowPhaseElapsed = 0;
  recordingImpactPauseRemaining = 0;
  recordingContactSlowTriggerCounts = new WeakMap<RapierBall, number>();
  recordingEffects?.reset();
  recordingCamera?.reset();
  try {
    await topicDemoApi.startSpinReversalDemo(recordingSpinMode);
  } finally {
    recordingLaunchPending = false;
  }
}

function secondsToNextTableContact(ball: RapierBall): number | null {
  if (ball.tableImpacts >= 2 || ball.supportedByTable) return null;
  const position = ball.body.translation();
  const velocity = ball.body.linvel();
  if (velocity.y >= -0.05 || position.y <= TABLE_CONTACT_Y) return null;
  const heightAboveContact = position.y - TABLE_CONTACT_Y;
  const discriminant = velocity.y ** 2 + 2 * 9.81 * heightAboveContact;
  if (discriminant <= 0) return null;
  const seconds = (velocity.y + Math.sqrt(discriminant)) / 9.81;
  return seconds >= 0 ? seconds : null;
}

function startContactSlowMotionIfNeeded(): void {
  if (recordingMode !== 'spin-reversal' || recordingContactSlowPhase !== 'idle') return;
  for (const ball of getBalls()) {
    const impactIndex = ball.tableImpacts;
    if (impactIndex >= 2 || recordingContactSlowTriggerCounts.get(ball) === impactIndex) continue;
    const secondsToImpact = secondsToNextTableContact(ball);
    if (secondsToImpact === null || secondsToImpact > recordingContactPreRollSeconds) continue;
    recordingContactSlowTriggerCounts.set(ball, impactIndex);
    recordingContactSlowPhase = 'ramp-in';
    recordingContactSlowPhaseElapsed = 0;
    return;
  }
}

function smoothstep01(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
}

function recordingContactPhysicsScale(): number {
  if (recordingContactSlowPhase === 'idle') return 1;
  if (recordingContactSlowPhase === 'hold') return recordingContactSlowScale;
  if (recordingContactSlowPhase === 'ramp-in') {
    const eased = smoothstep01(recordingContactSlowPhaseElapsed / recordingContactRampInSeconds);
    return 1 + (recordingContactSlowScale - 1) * eased;
  }
  const eased = smoothstep01(recordingContactSlowPhaseElapsed / recordingContactRampOutSeconds);
  return recordingContactSlowScale + (1 - recordingContactSlowScale) * eased;
}

function advanceRecordingContactSlowPhase(deltaSeconds: number): void {
  let remaining = Math.max(0, deltaSeconds);
  while (remaining > 0 && recordingContactSlowPhase !== 'idle') {
    const duration = recordingContactSlowPhase === 'ramp-in'
      ? recordingContactRampInSeconds
      : recordingContactSlowPhase === 'hold'
        ? recordingContactHoldSeconds
        : recordingContactRampOutSeconds;
    const untilBoundary = Math.max(0, duration - recordingContactSlowPhaseElapsed);
    if (remaining < untilBoundary) {
      recordingContactSlowPhaseElapsed += remaining;
      return;
    }
    remaining = Math.max(0, remaining - untilBoundary);
    if (recordingContactSlowPhase === 'ramp-in') recordingContactSlowPhase = 'hold';
    else if (recordingContactSlowPhase === 'hold') recordingContactSlowPhase = 'ramp-out';
    else recordingContactSlowPhase = 'idle';
    recordingContactSlowPhaseElapsed = 0;
  }
}

function retireCompletedRecordingBalls(): void {
  if (recordingMode !== 'spin-reversal') return;
  const retire: RapierBall[] = [];
  for (const ball of [...getBalls()]) {
    if (ball.recordingMaxImpacts === undefined) continue;
    if (ball.tableImpacts >= ball.recordingMaxImpacts && ball.recordingStopAt === undefined) {
      ball.recordingStopAt = ball.t + recordingPostSecondBounceSeconds;
    }
    if (ball.recordingStopAt !== undefined && ball.t >= ball.recordingStopAt) retire.push(ball);
  }
  for (const ball of retire) {
    scene.remove(ball.mesh);
    machineBallMeta.delete(ball.body);
    removeBall(ball);
  }
}

function updateRecordingImpactCues(): void {
  if (recordingMode !== 'spin-reversal' || !recordingEffects) return;
  const pending: Array<{
    ball: RapierBall;
    impact: number;
    event: RapierBall['tableImpactHistory'][number];
  }> = [];
  for (const ball of getBalls()) {
    const previous = recordingImpactCounts.get(ball) ?? 0;
    if (ball.tableImpacts > previous && ball.lastTableImpact) {
      for (let impact = previous + 1; impact <= ball.tableImpacts; impact += 1) {
        const event = ball.tableImpactHistory[impact - 1];
        if (!event) continue;
        pending.push({ ball, impact, event });
      }
    }
    recordingImpactCounts.set(ball, ball.tableImpacts);
  }
  // If both paths touch the table on the same simulation tick, put the path
  // named by the current chapter on top so the event card agrees with the
  // narration instead of being overwritten by iteration order.
  const focusColor = recordingSpinMode === 'standard' ? 0x54d6ff : 0xff5d73;
  pending.sort((left, right) => Number(left.ball.recordingColor === focusColor) - Number(right.ball.recordingColor === focusColor));
  for (const item of pending) {
    const ball = item.ball;
    if (!ball.lastTableImpact) continue;
    const ballLabel = ball.recordingColor === 0x54d6ff
      ? '蓝球'
      : ball.recordingColor === 0xff5d73
        ? '红球'
        : '球';
    recordingEffects.addImpactCue(
      ball.lastTableImpact.x * 1000,
      ball.lastTableImpact.z * 1000,
      ball.recordingColor ?? 0xffffff,
      item.impact,
      item.event,
      ballLabel,
    );
    recordingImpactPauseRemaining = Math.max(recordingImpactPauseRemaining, recordingImpactPauseSeconds);
  }
}

function updateRecordingChapter(): void {
  if (!recordingCamera) return;
  const chapter = document.getElementById('spin-recording-chapter');
  if (!chapter) return;
  if (recordingImpactPauseRemaining > 0) {
    chapter.textContent = '接触停帧 · 先看接触点，再看受力箭头';
  } else if (recordingContactSlowPhase !== 'idle') {
    const scale = recordingContactPhysicsScale();
    const phaseLabel = recordingContactSlowPhase === 'ramp-in'
      ? '缓入'
      : recordingContactSlowPhase === 'ramp-out'
        ? '缓出'
        : `${scale.toFixed(3)}×`;
    chapter.textContent = `接触慢放 · ${phaseLabel}`;
  } else {
    chapter.textContent = recordingPhaseLabels[recordingCamera.phase()];
  }
}

setResetMachineOnClear(() => {
  // Only exit when a topic is already running — not during topic startup clearBalls.
  if (topicDemoApi.isDemoActive()) topicDemoApi.exitTopicDemo();
  else trackingDemoApi.stopTrackingDemo(false);
  machineUiApi.resetMachineVisualsForClear();
});

// Preset activation touches tracking/demo APIs — run only after they exist.
machineUiApi.renderPresetButtons();
machineUiApi.setActivePreset(machineUiApi.activePreset);

let frames = 0, ft = 0, fps = 0;
let pageHiddenAt: number | null = document.hidden ? lastT : null;
//#endregion

//#region 公开 API
//#endregion
//#region 业务逻辑
function resumeSimulationClock(now: number): void {
  if (pageHiddenAt === null) {
    lastT = now;
    return;
  }
  const pausedMs = Math.max(0, now - pageHiddenAt);
  pageHiddenAt = null;
  lastT = now;

  // All absolute deadlines must move forward by the hidden duration. Physics
  // and replay clocks are delta-based and therefore need no catch-up step.
  if (machineUiApi.machineRunning) machineUiApi.nextMachineShotAt += pausedMs;
  trackingDemoApi.advanceClocksBy(pausedMs);
}

document.addEventListener('visibilitychange', () => {
  const now = performance.now();
  if (document.hidden) {
    pageHiddenAt = now;
    lastT = now;
  } else {
    resumeSimulationClock(now);
  }
});

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  if (document.hidden) {
    // Browsers throttle requestAnimationFrame in background tabs. Advancing a
    // capped 100 ms on each throttled callback creates an unintended slow-
    // motion simulation, so hidden frames intentionally advance nothing.
    if (pageHiddenAt === null) pageHiddenAt = now;
    lastT = now;
    return;
  }
  const rawElapsedSeconds = Math.max(0, (now - lastT) / 1000);
  // A long browser/OS hitch must not be repaid by simulating 100 ms in one
  // paint. In a recording take a duplicate frame is less damaging than a
  // visible teleport across the table.
  const elapsedSeconds = recordingMode === 'spin-reversal'
    ? Math.min(rawElapsedSeconds, 1 / recordingCaptureFps)
    : Math.min(rawElapsedSeconds, 0.1);
  const elapsedMs = elapsedSeconds * 1000;
  lastT = now;

  if (machineUiApi.machineRunning && now >= machineUiApi.nextMachineShotAt) {
    machineUiApi.feedMachine();
    machineUiApi.nextMachineShotAt = now + 1000 / machineUiApi.readMachineSettings().cadence;
  }

  trackingDemoApi.feedContinuousTrackingBall(now);

  // Tracking slow motion never changes this physical time step. The ball
  // follows the same trajectory; only camera phase timing/interpolation uses
  // trackingSpeed.
  if (recordingMode === 'spin-reversal') recordingCycleElapsed += elapsedSeconds;
  startContactSlowMotionIfNeeded();
  const impactPauseActive = recordingImpactPauseRemaining > 0;
  const recordingScale = impactPauseActive ? 0 : recordingContactPhysicsScale();
  physicsStep(elapsedSeconds * recordingScale);
  if (impactPauseActive) recordingImpactPauseRemaining = Math.max(0, recordingImpactPauseRemaining - elapsedSeconds);
  else advanceRecordingContactSlowPhase(elapsedSeconds);
  retireCompletedRecordingBalls();
  syncMeshes();
  updateRecordingImpactCues();
  recordingEffects?.update(elapsedSeconds);
  trackingDemoApi.updateTrackingDemo(now, elapsedSeconds);
  trackingReplayApi.updateReplay(elapsedSeconds);
  recordingCamera?.update(elapsedSeconds);
  updateRecordingChapter();

  for (const ball of getBalls()) {
    const meta = machineBallMeta.get(ball.body);
    if (meta?.isOpeningServe && ball.tableImpacts > meta.shownImpactCount && ball.lastTableImpact) {
      meta.shownImpactCount = ball.tableImpacts;
      if (ball.tableImpacts === 1) {
        machineUiApi.firstBounceMarker.position.set(ball.lastTableImpact.x * 1000, TABLE_TOP_Y + 3, ball.lastTableImpact.z * 1000);
      } else if (ball.tableImpacts === 2) {
        machineUiApi.targetMarker.position.set(ball.lastTableImpact.x * 1000, TABLE_TOP_Y + 2, ball.lastTableImpact.z * 1000);
      }
    }
    if (
      meta && !meta.countedLanding &&
      ball.lastTableImpact && ball.lastTableImpact.x > 1.37
    ) {
      meta.countedLanding = true;
      machineUiApi.incrementLandingCount();
    }
  }

  if (import.meta.env.DEV) {
    const firstBall = getBalls()[0];
    const counter = document.getElementById('bc')!;
    if (firstBall) {
      counter.dataset.telemetry = JSON.stringify({
        position: firstBall.body.translation(),
        linearVelocity: firstBall.body.linvel(),
        angularVelocity: firstBall.body.angvel(),
        tableImpacts: firstBall.tableImpacts,
        lastTableImpact: firstBall.lastTableImpact,
      });
      counter.dataset.allTelemetry = JSON.stringify(getBalls().map(ball => ({
        position: ball.body.translation(),
        linearVelocity: ball.body.linvel(),
        angularVelocity: ball.body.angvel(),
        tableImpacts: ball.tableImpacts,
        lastTableImpact: ball.lastTableImpact,
      })));
    } else {
      delete counter.dataset.telemetry;
      delete counter.dataset.allTelemetry;
    }
  }

  ft += elapsedMs;
  frames++;
  if (ft >= 500) {
    fps = Math.round(frames / (ft / 1000));
    frames = 0; ft = 0;
    document.getElementById('fps')!.textContent = String(fps);
  }
  trackingReplayApi.syncSpinBillboardPosition();
  if (!recordingCamera) controls.update();
  renderer.render(scene, camera);

  if (
    recordingMode === 'spin-reversal' &&
    recordingCycleElapsed >= recordingDemoRestartSeconds &&
    getBalls().length === 0 &&
    !recordingLaunchPending
  ) {
    void startRecordingSpinCycle();
  }
}

setInterval(() => {
  const all = getBalls();
  for (let i = all.length - 1; i >= 0; i--) {
    const position = all[i].body.translation();
    const outsideVenue =
      position.x < -5.7 || position.x > 8.45 ||
      position.z < -4.35 || position.z > 2.82 ||
      position.y < -0.25;
    if (outsideVenue) {
      scene.remove(all[i].mesh);
      machineBallMeta.delete(all[i].body);
      removeBall(all[i]);
    }
  }
  document.getElementById('bc')!.textContent = String(getBallCount());
}, 5000);

const sceneAssetsReady = loadSceneStls(scene);

Promise.all([initPhysics(), sceneAssetsReady]).then(() => {
  // The recording URL must wait for Rapier. Starting the topic one frame
  // earlier draws the planned paths but drops both physical balls because the
  // world is not ready yet.
  if (recordingMode === 'spin-reversal') {
    requestAnimationFrame(() => {
      void startRecordingSpinCycle();
    });
  }
  animate();
}).catch((error: unknown) => {
  console.error('[scene] startup failed', error);
});
//#endregion

//#region 方法/工具
window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    dropBall();
  }
  if (e.key.toLowerCase() === 'f') machineUiApi.feedMachine();
  if (e.key.toLowerCase() === 'p') machineUiApi.setMachineRunning(!machineUiApi.machineRunning);
  const shortcutPreset = SHOT_PRESETS.find(preset => preset.shortcut === e.key);
  if (shortcutPreset) {
    machineUiApi.setActivePreset(shortcutPreset);
    machineUiApi.feedMachine(shortcutPreset);
  }
  if (e.key === 'r') {
    receiveStance.viewHeightMm = 1600;
    receiveStance.viewStance = 'mid';
    receiveStance.applyViewPreset();
  }
  if (e.key === 'x') clearBalls();
});

window.addEventListener('resize', () => {
  camera.aspect = c.clientWidth / c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth, c.clientHeight);
});

//#endregion
