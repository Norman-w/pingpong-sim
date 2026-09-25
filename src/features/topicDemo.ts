//#region 导入/依赖
import * as THREE from 'three';
import type { RapierBall } from '../physics';
import { clampWindowPosition, closeAllUiPopups } from '../ui/windowManager';
import {
  getPreset,
  sampleTrajectory,
  TABLE_IMPACT_PROFILES,
  type LaunchSolution,
  type PlayerLevel,
  type SpinReversalResult,
  type TableImpactProfile,
  type TargetLane,
} from '../serveMachine';
import type { ContactTechnique } from '../domain/contactRules';
import type { ReceiveStanceApi, ViewStance } from './receiveStance';
import type { MachineUiApi } from './machineUi';
import type { TrackingDemoApi } from './trackingDemo';
import type { TrackingReplayApi } from './trackingReplay';
import {
  buildSpinTrajectoryLines,
  createSpinReversalRun,
  spinMetricsHtml,
  spinOriginFromSolution,
  spinOverlayStatus,
  type SpinReversalMode,
  type SpinReversalRun,
} from './spinReversalDemo';
export type { SpinReversalMode } from './spinReversalDemo';

//#endregion

//#region 常量/配置
//#endregion
//#region 模型/类型
export type DemoId = 'topspin' | 'spin-reversal' | 'child-lob' | 'child-triangle' | 'low-stance';
export type DemoVariant = 'child-lob-adult' | 'child-triangle-adult' | 'stance-high';

interface DemoScenario {
  presetId: string;
  eyeHeightMm: number;
  stance: ViewStance;
  lane: TargetLane;
  technique: ContactTechnique;
  strength: number;
  playerLevel: PlayerLevel;
  receiverLevel: PlayerLevel;
}

export interface TopicDemoDeps {
  scene: THREE.Scene;
  TABLE_TOP_Y: number;
  BALL_RADIUS: number;
  spawnPhysicsBall: (
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    color?: number,
    tableImpactProfile?: TableImpactProfile,
  ) => RapierBall | undefined;
  clearBalls: () => Promise<void>;
  machineUiApi: MachineUiApi;
  receiveStance: ReceiveStanceApi;
  trackingDemo: TrackingDemoApi;
  trackingReplay: TrackingReplayApi;
  syncWindowIndicators: () => void;
}

export interface TopicDemoApi {
  fireDemo: () => Promise<void>;
  updateDemo: () => void;
  clearDemoLines: () => void;
  startPresetTopicDemo: (id: Exclude<DemoId, 'topspin' | 'spin-reversal'>, variant?: DemoVariant) => Promise<void>;
  startSpinReversalDemo: (mode?: SpinReversalMode) => Promise<void>;
  setActiveDemoItem: (id: DemoId | null) => void;
  isDemoActive: () => boolean;
  setDemoActive: (value: boolean) => void;
  /** Leave topic mode: stop follow playlist and restore default replay-view checks. */
  exitTopicDemo: () => void;
}

export interface TopicDemoExitActions {
  stopTracking: (resetStatus: boolean) => void;
  clearPlaybackPlan: () => void;
  unlockTargetDepth: () => void;
  showMachine: () => void;
  syncIndicators: () => void;
}
//#endregion

//#region 私有成员
const DEMO_SCENARIOS: Record<Exclude<DemoId, 'topspin' | 'spin-reversal'>, DemoScenario> = {
  'child-lob': {
    presetId: 'lob', eyeHeightMm: 950, stance: 'far', lane: 'random',
    technique: 'smash', strength: 100, playerLevel: 'club', receiverLevel: 'beginner',
  },
  'child-triangle': {
    presetId: 'float-short', eyeHeightMm: 950, stance: 'near', lane: 'forehand',
    technique: 'drop-shot', strength: 100, playerLevel: 'club', receiverLevel: 'club',
  },
  'low-stance': {
    presetId: 'loop-fast', eyeHeightMm: 1350, stance: 'near', lane: 'middle',
    technique: 'block', strength: 92, playerLevel: 'advanced', receiverLevel: 'club',
  },
};

let deps!: TopicDemoDeps;

let strengthEl!: HTMLInputElement;
let laneEl!: HTMLInputElement;
let levelEl!: HTMLInputElement;
let randomizeEl!: HTMLInputElement;
let demoPowerEl!: HTMLInputElement;
let demoSpinEl!: HTMLInputElement;
let demoSideEl!: HTMLInputElement;
let spinReversalMode: SpinReversalMode = 'reversal';
let currentSpinRun: SpinReversalRun | null = null;
const demoLines: THREE.Line[] = [];
let demoActive = false;

function setActiveDemoItem(id: DemoId | null): void {
  document.querySelectorAll<HTMLElement>('[data-demo-item]').forEach(item => {
    item.classList.toggle('active', item.dataset.demoItem === id);
  });
}

function expandDemoItem(item: HTMLElement, expanded: boolean): void {
  item.classList.toggle('collapsed', !expanded);
  const button = item.querySelector<HTMLButtonElement>('.demo-expand');
  button?.setAttribute('aria-expanded', String(expanded));
  if (button) button.setAttribute('aria-label', `${expanded ? '折叠' : '展开'}${item.querySelector('.demo-item-title')?.firstChild?.textContent?.trim() ?? '专题'}`);
  const windowEl = item.closest<HTMLElement>('.ui-window');
  if (windowEl) requestAnimationFrame(() => {
    const rect = windowEl.getBoundingClientRect();
    clampWindowPosition(windowEl, rect.left, rect.top);
  });
}

function demoSolutions(): [LaunchSolution, LaunchSolution] {
  const speed = Number(demoPowerEl.value) / 10;
  const spin = Number(demoSpinEl.value);
  const side = Number(demoSideEl.value);
  const elevation = THREE.MathUtils.degToRad(8);
  const vx = speed * Math.cos(elevation);
  const vy = speed * Math.sin(elevation);
  const rpmToRad = 2 * Math.PI / 60;
  const spun: LaunchSolution = {
    originMm: { x: -180, y: 1280, z: -762.5 },
    velocityMm: { x: vx * 1000, y: vy * 1000, z: 0 },
    angularVelocity: { x: side * .25 * rpmToRad, y: side * rpmToRad, z: -spin * rpmToRad },
    targetMm: { x: 2380, y: deps.TABLE_TOP_Y + deps.BALL_RADIUS, z: -762.5 },
    speedMps: speed,
    spinRpm: Math.hypot(spin, side, side * .25),
    netClearanceMm: 0,
  };
  const flat: LaunchSolution = { ...spun, angularVelocity: { x: 0, y: 0, z: 0 }, spinRpm: 0 };
  return [flat, spun];
}

function setSpinRecordingOverlay(visible: boolean, run: SpinReversalRun | null = currentSpinRun, cleanStage = false): void {
  const overlay = document.getElementById('spin-recording-overlay');
  const status = document.getElementById('spin-recording-status');
  overlay?.classList.toggle('visible', visible);
  document.body.classList.toggle('recording-mode', cleanStage);
  if (!status || !run) return;
  status.textContent = spinOverlayStatus(run);
}

function renderSpinReversal(mode: SpinReversalMode): void {
  spinReversalMode = mode;
  const run = createSpinReversalRun(mode);
  currentSpinRun = run;
  const metrics = document.getElementById('spin-reversal-metrics');
  if (metrics) metrics.innerHTML = spinMetricsHtml(run);
  setSpinRecordingOverlay(true, run);
  document.querySelectorAll<HTMLButtonElement>('[data-spin-profile]').forEach(button => {
    button.classList.toggle('active', button.dataset.spinProfile === mode);
    button.setAttribute('aria-pressed', String(button.dataset.spinProfile === mode));
  });
  clearDemoLines();
  if (!demoActive) return;
  for (const line of buildSpinTrajectoryLines(run)) {
    deps.scene.add(line);
    demoLines.push(line);
  }
}
//#endregion

//#region 公开 API
export function initTopicDemo(topicDemoDeps: TopicDemoDeps): TopicDemoApi {
  deps = topicDemoDeps;

  strengthEl = document.getElementById('machine-strength') as HTMLInputElement;
  laneEl = document.getElementById('machine-lane') as HTMLInputElement;
  levelEl = document.getElementById('machine-level') as HTMLInputElement;
  randomizeEl = document.getElementById('machine-randomize') as HTMLInputElement;
  demoPowerEl = document.getElementById('demo-power') as HTMLInputElement;
  demoSpinEl = document.getElementById('demo-spin') as HTMLInputElement;
  demoSideEl = document.getElementById('demo-side') as HTMLInputElement;

  document.querySelectorAll<HTMLButtonElement>('.demo-expand').forEach(button => {
    button.addEventListener('click', () => {
      const item = button.closest<HTMLElement>('.demo-item');
      if (item) expandDemoItem(item, item.classList.contains('collapsed'));
    });
  });

  demoPowerEl.addEventListener('input', updateDemo);
  demoSpinEl.addEventListener('input', updateDemo);
  demoSideEl.addEventListener('input', updateDemo);
  document.getElementById('demo-preview')!.addEventListener('click', () => {
    demoActive = true;
    deps.machineUiApi.setMachineVisible(false);
    updateDemo();
    deps.syncWindowIndicators();
  });
  document.getElementById('demo-fire')!.addEventListener('click', () => void fireDemo());
  document.querySelectorAll<HTMLButtonElement>('[data-demo-start]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.demoStart as DemoId;
      if (id === 'topspin') void fireDemo();
      else if (id === 'spin-reversal') void startSpinReversalDemo();
      else void startPresetTopicDemo(id);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-spin-profile]').forEach(button => {
    button.addEventListener('click', () => {
      const mode = button.dataset.spinProfile as SpinReversalMode;
      renderSpinReversal(mode);
    });
  });
  document.getElementById('spin-reversal-preview')?.addEventListener('click', () => {
    demoActive = true;
    deps.machineUiApi.setMachineVisible(false);
    renderSpinReversal(spinReversalMode);
    deps.syncWindowIndicators();
  });
  document.getElementById('spin-reversal-fire')?.addEventListener('click', () => {
    void startSpinReversalDemo(spinReversalMode);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-demo-variant]').forEach(button => {
    button.addEventListener('click', () => {
      const variant = button.dataset.demoVariant as DemoVariant;
      const item = button.closest<HTMLElement>('[data-demo-item]');
      const id = item?.dataset.demoItem as Exclude<DemoId, 'topspin' | 'spin-reversal'> | undefined;
      if (id) void startPresetTopicDemo(id, variant);
    });
  });
  updateDemo();
  deps.syncWindowIndicators();

  // Opening machine / tracking panels leaves the topic playlist.
  for (const windowId of ['machine-window', 'tracking-window'] as const) {
    document.querySelector(`[data-window-toggle="${windowId}"]`)?.addEventListener('click', () => {
      if (demoActive) exitTopicDemo();
    });
  }
  // Using controls inside those panels also exits (capture before the control acts).
  for (const windowId of ['machine-window', 'tracking-window'] as const) {
    document.getElementById(windowId)?.addEventListener('click', event => {
      if (!demoActive) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest('button, input, select, label, .preset-button')) return;
      // tracking-start owns exit so it does not immediately re-start follow.
      if (target.closest('#tracking-start')) return;
      exitTopicDemo();
    }, true);
  }

  return {
    fireDemo,
    updateDemo,
    clearDemoLines,
    startPresetTopicDemo,
    startSpinReversalDemo,
    setActiveDemoItem,
    isDemoActive: () => demoActive,
    setDemoActive: (value: boolean) => { demoActive = value; },
    exitTopicDemo,
  };
}

function exitTopicDemo(): void {
  // Must not run while starting a topic: clearBalls fires before demoActive=true
  // and would wipe the follow-only playlist that was just configured.
  if (!demoActive) return;
  demoActive = false;
  setActiveDemoItem(null);
  clearDemoLines();
  currentSpinRun = null;
  setSpinRecordingOverlay(false, null);
  performTopicDemoExit({
    stopTracking: deps.trackingDemo.stopTrackingDemo,
    clearPlaybackPlan: deps.trackingReplay.clearDemoPlaybackPlan,
    unlockTargetDepth: () => deps.machineUiApi.lockTargetDepthMm(null),
    showMachine: () => deps.machineUiApi.setMachineVisible(true),
    syncIndicators: deps.syncWindowIndicators,
  });
}

/** Testable boundary for every state restoration required when leaving a topic. */
export function performTopicDemoExit(actions: TopicDemoExitActions): void {
  actions.stopTracking(true);
  actions.clearPlaybackPlan();
  actions.unlockTargetDepth();
  actions.showMachine();
  actions.syncIndicators();
}

function clearDemoLines(): void {
  for (const line of demoLines) { deps.scene.remove(line); line.geometry.dispose(); }
  demoLines.length = 0;
}

function updateDemo(): void {
  document.getElementById('demo-power-value')!.textContent = `${(Number(demoPowerEl.value) / 10).toFixed(1)} m/s`;
  document.getElementById('demo-spin-value')!.textContent = `${demoSpinEl.value} rpm`;
  document.getElementById('demo-side-value')!.textContent = `${Number(demoSideEl.value) > 0 ? '+' : ''}${demoSideEl.value} rpm`;
  const speed = Number(demoPowerEl.value) / 10;
  const omega = Number(demoSpinEl.value) * 2 * Math.PI / 60;
  const spinParameter = .02 * omega / Math.max(.1, speed);
  const liftCoefficient = .5 * (1 - Math.exp(-1.8 * spinParameter));
  const dynamicPressure = .5 * 1.204 * speed * speed;
  const pressureDifference = dynamicPressure * liftCoefficient;
  const downwardAcceleration = pressureDifference * Math.PI * .02 ** 2 / .0027;
  document.getElementById('demo-metrics')!.innerHTML =
    `旋转参数 S=${spinParameter.toFixed(2)} · 升力系数 C<sub>L</sub>=${liftCoefficient.toFixed(3)}<br>` +
    `估算压强差 ${pressureDifference.toFixed(1)}Pa · 额外下坠 ${downwardAcceleration.toFixed(1)}m/s²（${(downwardAcceleration / 9.81).toFixed(2)}g）`;
  clearDemoLines();
  if (!demoActive) return;
  const colors = [0xb8c0cc, 0xff5d73];
  demoSolutions().forEach((solution, i) => {
    const points = sampleTrajectory(solution).map(p => new THREE.Vector3(p.x, p.y, p.z + (i === 0 ? -45 : 45)));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: colors[i], transparent: true, opacity: .9 }));
    deps.scene.add(line); demoLines.push(line);
  });
}

async function startPresetTopicDemo(id: Exclude<DemoId, 'topspin' | 'spin-reversal'>, variant?: DemoVariant): Promise<void> {
  setSpinRecordingOverlay(false, null);
  const base = DEMO_SCENARIOS[id];
  const scenario: DemoScenario = { ...base };
  if (variant === 'child-lob-adult' || variant === 'child-triangle-adult') scenario.eyeHeightMm = 1600;
  if (variant === 'stance-high') scenario.eyeHeightMm = 1800;

  // Drop any previous topic first so clearBalls inside startTrackingDemo
  // cannot treat this launch as an "exit" and wipe the new playlist.
  if (demoActive) exitTopicDemo();
  closeAllUiPopups();
  deps.trackingDemo.stopTrackingDemo(false);
  deps.machineUiApi.setMachineRunning(false);
  strengthEl.value = String(scenario.strength);
  levelEl.value = scenario.playerLevel;
  deps.receiveStance.receiverLevel = scenario.receiverLevel;
  laneEl.value = scenario.lane;
  randomizeEl.checked = id === 'child-lob';
  deps.trackingDemo.setContinuousChecked(false);
  if (id === 'child-lob') {
    // Follow view only: 2× normal (1 live + 1× full-speed replay) + 2× slow.
    deps.machineUiApi.rollAndLockLobDemoTarget();
    deps.machineUiApi.setBallStyle('white-yellow-eight');
    deps.trackingReplay.configureFollowOnlyDemoPlayback({
      livePasses: 2,
      slowPasses: 2,
      slowSpeed: 0.2,
      continuous: true,
    });
  } else {
    deps.machineUiApi.lockTargetDepthMm(null);
    deps.trackingReplay.enableAutoReplayForDemo();
  }
  deps.machineUiApi.setActivePreset(getPreset(scenario.presetId), false);
  deps.receiveStance.contactTechnique = deps.receiveStance.preferTechniqueForPreset(deps.machineUiApi.activePreset);
  deps.receiveStance.updateTechniqueOptions();
  deps.machineUiApi.syncAllFlatChoices();
  deps.receiveStance.updateReceiverLevelDisplay();
  deps.machineUiApi.updateMachineDetails();
  deps.receiveStance.applyDemoObserverSetup(scenario);
  deps.receiveStance.updateContactGuide(false);

  await deps.trackingDemo.startTrackingDemo();
  // startTrackingDemo / attach paths may reopen panels — keep the stage clear.
  closeAllUiPopups();
  demoActive = true;
  setActiveDemoItem(id);
  deps.syncWindowIndicators();
}

async function startSpinReversalDemo(mode = spinReversalMode): Promise<void> {
  if (demoActive) exitTopicDemo();
  closeAllUiPopups();
  deps.trackingDemo.stopTrackingDemo(false);
  await deps.clearBalls();
  deps.machineUiApi.setMachineRunning(false);
  deps.machineUiApi.setActivePreset(getPreset('serve-back-short'), false);
  deps.receiveStance.contactTechnique = deps.receiveStance.preferTechniqueForPreset(deps.machineUiApi.activePreset);
  deps.receiveStance.updateTechniqueOptions();
  deps.receiveStance.applyDemoObserverSetup({ eyeHeightMm: 1600, stance: 'mid' });
  deps.machineUiApi.setMachineVisible(false);
  demoActive = true;
  setActiveDemoItem('spin-reversal');
  renderSpinReversal(mode);

  const run = currentSpinRun;
  if (!run) return;
  const launches: Array<{ result: SpinReversalResult; profile: TableImpactProfile; zOffsetMm: number; color: number }> = [
    { result: run.standard, profile: TABLE_IMPACT_PROFILES.standard, zOffsetMm: -180, color: 0x54d6ff },
    { result: run.comparison, profile: run.comparisonProfile, zOffsetMm: 180, color: 0xff5d73 },
  ];
  let trackedBall: RapierBall | undefined;
  for (const [index, launch] of launches.entries()) {
    const origin = spinOriginFromSolution(run.solution, launch.zOffsetMm);
    const ball = deps.spawnPhysicsBall(
      origin.x * 1000,
      origin.y * 1000,
      origin.z * 1000,
      origin.vx * 1000,
      origin.vy * 1000,
      origin.vz * 1000,
      launch.color,
      launch.profile,
    );
    if (!ball) continue;
    ball.body.setAngvel(run.solution.angularVelocity, true);
    if (index === 1) trackedBall = ball;
  }
  if (trackedBall) deps.trackingDemo.attachBallToTracking(trackedBall);
  setSpinRecordingOverlay(true, run, true);
  closeAllUiPopups();
  deps.syncWindowIndicators();
}

async function fireDemo(): Promise<void> {
  // Use the current sliders as-is. Unmodified controls already hold the topic defaults.
  setSpinRecordingOverlay(false, null);
  closeAllUiPopups();
  await deps.clearBalls();
  deps.machineUiApi.setMachineRunning(false);
  deps.machineUiApi.setActivePreset(getPreset('loop-spin'), false);
  deps.receiveStance.contactTechnique = deps.receiveStance.preferTechniqueForPreset(deps.machineUiApi.activePreset);
  deps.receiveStance.updateTechniqueOptions();
  deps.receiveStance.applyDemoObserverSetup({
    eyeHeightMm: 1600,
    stance: 'mid',
  });
  demoActive = true;
  deps.machineUiApi.setMachineVisible(false);
  updateDemo();
  let trackedBall: RapierBall | null | undefined;
  demoSolutions().forEach((solution, i) => {
    const zOffset = i === 0 ? -45 : 45;
    const ball = deps.spawnPhysicsBall(solution.originMm.x, solution.originMm.y, solution.originMm.z + zOffset, solution.velocityMm.x, solution.velocityMm.y, solution.velocityMm.z, i === 0 ? 0xb8c0cc : 0xff5d73);
    ball?.body.setAngvel(solution.angularVelocity, true);
    // Follow the spun ball — the more realistic incoming path for the topic.
    if (i === 1) trackedBall = ball;
  });
  if (trackedBall) deps.trackingDemo.attachBallToTracking(trackedBall);
  closeAllUiPopups();
  setActiveDemoItem('topspin');
  deps.syncWindowIndicators();
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
