//#region 导入/依赖
import * as THREE from 'three';
import { createMachineModel, type MachineModel } from '../scene/machineModel';
import { CONTACT_TECHNIQUES } from '../domain/contactRules';
import {
  getBallCount,
  getBalls,
  isReady,
  removeBall,
  resetStepAccumulator,
  type RapierBall,
} from '../physics';
import {
  RUBBER_PROFILES,
  SHOT_CATEGORIES,
  SHOT_PRESETS,
  getPreset,
  getShotKnowledge,
  sampleTrajectoryDetails,
  solveLaunch,
  type BallStyle,
  type LaunchSolution,
  type MachineSettings,
  type PlayerLevel,
  type ShotPreset,
  type TargetLane,
} from '../serveMachine';
import { buildMachineDetailHtml, buildParameterDialogHtml } from './machineDetailsView';
import type { ReceiveStanceApi } from './receiveStance';

//#endregion

//#region 常量/配置
const MACHINE_NOZZLE_TIP_LOCAL_X = 265;
const MAX_TRACKED_BALLS = 80;
/** Lift + tube thickness keep landing discs from z-fighting the table in god view. */
const LANDING_DISC_CLEARANCE_MM = 10;
/** Full receiver-half lob band (mm): just past net ↔ near end line. */
/** Mid-to-deep first bounce: short soft landings leave a second bounce on table. */
const LOB_DEMO_DEPTH_MIN_MM = 1850;
const LOB_DEMO_DEPTH_MAX_MM = 2680;
//#endregion

//#region 模型/类型
type MachineBallMeta = { presetId: string; countedLanding: boolean; isOpeningServe: boolean; shownImpactCount: number };

export interface MachineUiDeps {
  scene: THREE.Scene;
  TABLE_TOP_Y: number;
  TABLE_CENTER_X: number;
  TABLE_CENTER_Z: number;
  BALL_RADIUS: number;
  spawnPhysicsBall: (x: number, y: number, z: number, vx: number, vy: number, vz: number, color?: number) => RapierBall | undefined;
  machineBallMeta: Map<any, MachineBallMeta>;
  setBallStyle: (style: BallStyle) => void;
  syncWindowIndicators: () => void;
  stopTrackingDemo: () => void;
  clearDemoLines: () => void;
  setActiveDemoItem: (id: string | null) => void;
  /** Manual machine control leaves an active topic demo. */
  exitTopicDemo: () => void;
  refreshReplayCuePointsUi: () => void;
  receiveStance: ReceiveStanceApi;
  isTrackingEnabled: () => boolean;
  isTrackingReplayMode: () => boolean;
  isTrackingContinuous: () => boolean;
  hasTrackingSession: () => boolean;
}

export interface MachineUiApi {
  readMachineSettings: () => MachineSettings;
  updateMachinePose: (solution: LaunchSolution) => void;
  updateMachineDetails: (solution?: LaunchSolution) => void;
  showParameterDialog: () => void;
  setActivePreset: (preset: ShotPreset, updateCadence?: boolean) => void;
  renderPresetButtons: () => void;
  feedMachine: (preset?: ShotPreset, preserveTracking?: boolean) => RapierBall | undefined;
  setMachineRunning: (running: boolean) => void;
  setMachineVisible: (visible: boolean) => void;
  syncAllFlatChoices: () => void;
  setBallStyle: (style: BallStyle) => void;
  updateMachineOperatingStatus: () => void;
  resetMachineVisualsForClear: () => void;
  incrementLandingCount: () => void;
  /** Lock rally depth for repeated feeds (null clears). */
  lockTargetDepthMm: (depthMm: number | null) => void;
  /**
   * Roll a full-table lob target (depth + random lane) and lock depth for the
   * current demo cycle. Lane stays on `random` so each feed re-rolls Z.
   */
  rollAndLockLobDemoTarget: () => number;
  /** @deprecated Prefer rollAndLockLobDemoTarget — kept as alias. */
  rollAndLockLobDemoDepth: () => number;
  /** Remove every physics ball except an optional keep (e.g. replay source). */
  discardBallsExcept: (keep?: RapierBall | null) => void;
  readonly targetMarker: THREE.Mesh;
  readonly firstBounceMarker: THREE.Mesh;
  readonly serveTrajectoryLine: THREE.Line;
  readonly activePreset: ShotPreset;
  readonly machineRunning: boolean;
  readonly targetLane: TargetLane;
  readonly currentMachineBallOrigin: THREE.Vector3;
  nextMachineShotAt: number;
}
//#endregion

//#region 私有成员
let deps!: MachineUiDeps;
let machineModel!: MachineModel;

let activePreset: ShotPreset = getPreset('top-light');
let nextMachineShotAt = 0;
let machineShotCount = 0;
let machineLandingCount = 0;
let machineRunning = false;
let targetDepthOverrideMm: number | null = null;

let presetGroupsEl!: HTMLElement;
let strengthEl!: HTMLInputElement;
let cadenceEl!: HTMLInputElement;
let laneEl!: HTMLInputElement;
let levelEl!: HTMLInputElement;
let randomizeEl!: HTMLInputElement;
let ballStyleEl!: HTMLInputElement;
let strengthValueEl!: HTMLElement;
let cadenceValueEl!: HTMLElement;
let machineStatusEl!: HTMLElement;
let machineDetailEl!: HTMLElement;
let machineToggleEl!: HTMLButtonElement;
let machineOnceEl!: HTMLButtonElement;
let parameterDialog!: HTMLDialogElement;

const currentMachineBallOrigin = new THREE.Vector3(45, 1120, -762.5);
const targetMarker = createLandingDiscMarker(40.5, 7, 0xffd166);
const firstBounceMarker = createLandingDiscMarker(29.5, 5.5, 0x54d6ff);
const serveTrajectoryLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0x54d6ff, dashSize: 45, gapSize: 24, transparent: true, opacity: .75 }),
);
serveTrajectoryLine.visible = false;

function syncFlatChoiceGroup(group: HTMLElement): void {
  const target = document.getElementById(group.dataset.flatSelect ?? '') as HTMLInputElement | null;
  if (!target) return;
  group.querySelectorAll<HTMLButtonElement>('[data-value]').forEach(button => {
    const selected = button.dataset.value === target.value;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

//#endregion

//#region 公开 API
export function initMachineUi(machineUiDeps: MachineUiDeps): MachineUiApi {
  deps = machineUiDeps;
  targetMarker.position.y = deps.TABLE_TOP_Y + LANDING_DISC_CLEARANCE_MM;
  firstBounceMarker.position.y = deps.TABLE_TOP_Y + LANDING_DISC_CLEARANCE_MM + 1;
  currentMachineBallOrigin.set(45, 1120, deps.TABLE_CENTER_Z);
  deps.scene.add(targetMarker, firstBounceMarker, serveTrajectoryLine);
  machineModel = createMachineModel(deps.scene);

  presetGroupsEl = document.getElementById('preset-groups')!;
  strengthEl = document.getElementById('machine-strength') as HTMLInputElement;
  cadenceEl = document.getElementById('machine-cadence') as HTMLInputElement;
  laneEl = document.getElementById('machine-lane') as HTMLInputElement;
  levelEl = document.getElementById('machine-level') as HTMLInputElement;
  randomizeEl = document.getElementById('machine-randomize') as HTMLInputElement;
  ballStyleEl = document.getElementById('ball-style') as HTMLInputElement;
  strengthValueEl = document.getElementById('strength-value')!;
  cadenceValueEl = document.getElementById('cadence-value')!;
  machineStatusEl = document.getElementById('machine-status')!;
  machineDetailEl = document.getElementById('machine-detail')!;
  machineToggleEl = document.getElementById('machine-toggle') as HTMLButtonElement;
  machineOnceEl = document.getElementById('machine-once') as HTMLButtonElement;
  parameterDialog = document.getElementById('parameter-dialog') as HTMLDialogElement;

  document.querySelectorAll<HTMLElement>('[data-flat-select]').forEach(group => {
    const target = document.getElementById(group.dataset.flatSelect ?? '') as HTMLInputElement | null;
    if (!target) return;
    group.querySelectorAll<HTMLButtonElement>('[data-value]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.value === target.value) return;
        target.value = button.dataset.value ?? target.value;
        syncFlatChoiceGroup(group);
        target.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    syncFlatChoiceGroup(group);
  });

  document.getElementById('dialog-close')!.addEventListener('click', () => parameterDialog.close());
  machineOnceEl.addEventListener('click', () => feedMachine());
  machineToggleEl.addEventListener('click', () => setMachineRunning(!machineRunning));
  strengthEl.addEventListener('input', () => updateMachineDetails());
  cadenceEl.addEventListener('input', () => updateMachineDetails());
  laneEl.addEventListener('change', () => {
    updateMachineDetails();
    deps.receiveStance.resetAutomaticStance(true);
    deps.receiveStance.updateContactGuide();
  });
  levelEl.addEventListener('change', () => updateMachineDetails());
  randomizeEl.addEventListener('change', () => updateMachineDetails());
  ballStyleEl.addEventListener('change', () => deps.setBallStyle(ballStyleEl.value as BallStyle));
  deps.setBallStyle(ballStyleEl.value as BallStyle);

  return {
    readMachineSettings,
    updateMachinePose,
    updateMachineDetails,
    showParameterDialog,
    setActivePreset,
    renderPresetButtons,
    feedMachine,
    setMachineRunning,
    setMachineVisible,
    syncAllFlatChoices,
    setBallStyle: applyBallStyle,
    updateMachineOperatingStatus,
    resetMachineVisualsForClear,
    incrementLandingCount,
    lockTargetDepthMm: (depthMm: number | null) => { targetDepthOverrideMm = depthMm; },
    rollAndLockLobDemoTarget,
    rollAndLockLobDemoDepth: rollAndLockLobDemoTarget,
    discardBallsExcept,
    get targetMarker() { return targetMarker; },
    get firstBounceMarker() { return firstBounceMarker; },
    get serveTrajectoryLine() { return serveTrajectoryLine; },
    get activePreset() { return activePreset; },
    get machineRunning() { return machineRunning; },
    get targetLane() { return laneEl.value as TargetLane; },
    get currentMachineBallOrigin() { return currentMachineBallOrigin; },
    get nextMachineShotAt() { return nextMachineShotAt; },
    set nextMachineShotAt(value: number) { nextMachineShotAt = value; },
  };
}

function setMachineVisible(visible: boolean): void {
  machineModel.group.visible = visible;
}

function syncAllFlatChoices(): void {
  document.querySelectorAll<HTMLElement>('[data-flat-select]').forEach(syncFlatChoiceGroup);
}

function applyBallStyle(style: BallStyle): void {
  ballStyleEl.value = style;
  syncAllFlatChoices();
  deps.setBallStyle(style);
}

function rollAndLockLobDemoTarget(): number {
  const depthMm = LOB_DEMO_DEPTH_MIN_MM + Math.random() * (LOB_DEMO_DEPTH_MAX_MM - LOB_DEMO_DEPTH_MIN_MM);
  targetDepthOverrideMm = Math.round(depthMm);
  // Full-table lateral: each feed re-rolls Z via randomTargetZ.
  laneEl.value = 'random';
  syncAllFlatChoices();
  return targetDepthOverrideMm;
}

function discardBallsExcept(keep?: RapierBall | null): void {
  for (const ball of [...getBalls()]) {
    if (keep && ball === keep) continue;
    deps.scene.remove(ball.mesh);
    deps.machineBallMeta.delete(ball.body);
    removeBall(ball);
  }
  document.getElementById('bc')!.textContent = String(getBallCount());
}

function readMachineSettings(): MachineSettings {
  return {
    strength: Number(strengthEl.value) / 100,
    cadence: Number(cadenceEl.value),
    targetLane: laneEl.value as TargetLane,
    ...(targetDepthOverrideMm != null ? { targetDepthOverrideMm } : {}),
    randomize: randomizeEl.checked,
    playerLevel: levelEl.value as PlayerLevel,
  };
}

function updateMachinePose(solution: LaunchSolution): void {
  const { originMm, velocityMm } = solution;
  currentMachineBallOrigin.set(originMm.x, originMm.y, originMm.z);
  machineModel.group.position.set(originMm.x - 45, 0, originMm.z - deps.TABLE_CENTER_Z);
  const horizontalSpeed = Math.hypot(velocityMm.x, velocityMm.z);
  machineModel.group.rotation.y = -Math.atan2(velocityMm.z, velocityMm.x);
  machineModel.head.rotation.order = 'ZYX';
  machineModel.head.rotation.z = Math.atan2(velocityMm.y, horizontalSpeed);
  machineModel.head.rotation.y = 0;
  // The nozzle rotates with the head. Recompute the head centre from the
  // rotated nozzle tip so the visible outlet always touches the physical
  // ball at its true launch position, including high/low attacking arcs.
  const launchDirection = new THREE.Vector3(velocityMm.x, velocityMm.y, velocityMm.z).normalize();
  const desiredNozzleTip = new THREE.Vector3(originMm.x, originMm.y, originMm.z)
    .addScaledVector(launchDirection, -deps.BALL_RADIUS);
  const rotatedNozzleOffset = new THREE.Vector3(MACHINE_NOZZLE_TIP_LOCAL_X, 0, 0)
    .applyQuaternion(machineModel.head.quaternion);
  const localNozzleTip = desiredNozzleTip.clone()
    .sub(machineModel.group.position)
    .applyQuaternion(machineModel.group.quaternion.clone().invert());
  machineModel.head.position.copy(localNozzleTip)
    .sub(rotatedNozzleOffset);
  const lowerY = 970;
  const upperY = machineModel.head.position.y - 90;
  machineModel.upperMast.position.y = (lowerY + upperY) / 2;
  machineModel.upperMast.scale.y = Math.max(1, upperY - lowerY);
}

function updateMachineDetails(solution?: LaunchSolution): void {
  const settings = readMachineSettings();
  strengthValueEl.textContent = `${Math.round(settings.strength * 100)}%`;
  cadenceValueEl.textContent = `${settings.cadence.toFixed(1)} 球/秒`;
  machineDetailEl.innerHTML = buildMachineDetailHtml({
    preset: activePreset,
    settings,
    solution,
    tableCenterZ: deps.TABLE_CENTER_Z,
  });
  document.getElementById('parameter-info')?.addEventListener('click', showParameterDialog);
}

function showParameterDialog(): void {
  const settings = readMachineSettings();
  const handlingListHtml = deps.receiveStance.availableTechniquesForPreset(activePreset)
    .map(id => `<li><b>${CONTACT_TECHNIQUES[id].label}</b>：${CONTACT_TECHNIQUES[id].description} 时机：${CONTACT_TECHNIQUES[id].timing}。</li>`)
    .join('');
  const { title, content } = buildParameterDialogHtml({ preset: activePreset, settings, handlingListHtml });
  document.getElementById('dialog-title')!.textContent = title;
  document.getElementById('dialog-content')!.innerHTML = content;
  parameterDialog.showModal();
}

function setActivePreset(preset: ShotPreset, updateCadence = true): void {
  activePreset = preset;
  deps.receiveStance.trackedReceiveBounceX = null;
  if (updateCadence) cadenceEl.value = String(preset.cadence);
  document.querySelectorAll<HTMLButtonElement>('.preset-button').forEach(button => {
    button.classList.toggle('active', button.dataset.preset === preset.id);
  });
  updateMachineDetails();
  deps.receiveStance.updateTechniqueOptions();
  deps.receiveStance.resetAutomaticStance(true);
  deps.receiveStance.updateContactGuide(false);
  deps.refreshReplayCuePointsUi();
}

function renderPresetButtons(): void {
  presetGroupsEl.replaceChildren();
  for (const category of SHOT_CATEGORIES) {
    const section = document.createElement('section');
    section.className = 'preset-group';
    const title = document.createElement('h3');
    title.textContent = category;
    const buttons = document.createElement('div');
    buttons.className = 'preset-buttons';
    for (const preset of SHOT_PRESETS.filter(item => item.category === category)) {
      const knowledge = getShotKnowledge(preset);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset-button';
      button.dataset.preset = preset.id;
      button.style.setProperty('--preset-color', `#${preset.color.toString(16).padStart(6, '0')}`);
      const spin = Math.round(Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm));
      button.title = `${preset.description} ${preset.speedMps}m/s · ${spin}rpm`;
      const rubberLabels = knowledge.commonRubbers.map(key => RUBBER_PROFILES[key].label).join('/');
      button.dataset.tip = `${knowledge.family}｜${preset.description}｜${rubberLabels}｜基准 ${preset.speedMps}m/s｜合成 ${spin}rpm${preset.mode === 'serve' ? '｜合法双落台发球' : ''}`;
      button.innerHTML = preset.shortcut
        ? `<kbd>${preset.shortcut}</kbd>${preset.name}`
        : preset.name;
      button.addEventListener('click', () => {
        deps.exitTopicDemo();
        setActivePreset(preset);
      });
      buttons.appendChild(button);
    }
    section.append(title, buttons);
    presetGroupsEl.appendChild(section);
  }
}

function feedMachine(preset = activePreset, preserveTracking = false): RapierBall | undefined {
  if (!isReady()) return undefined;
  if (!preserveTracking) {
    deps.exitTopicDemo();
    deps.stopTrackingDemo();
  }
  setMachineVisible(true);
  if (getBallCount() >= MAX_TRACKED_BALLS) {
    const oldest = getBalls()[0];
    deps.scene.remove(oldest.mesh);
    deps.machineBallMeta.delete(oldest.body);
    removeBall(oldest);
  }
  const solution = solveLaunch(preset, readMachineSettings());
  const ball = deps.spawnPhysicsBall(
    solution.originMm.x, solution.originMm.y, solution.originMm.z,
    solution.velocityMm.x, solution.velocityMm.y, solution.velocityMm.z,
    preset.color,
  );
  if (!ball) return undefined;
  ball.body.setAngvel(solution.angularVelocity, true);
  // solveLaunch can stall the main thread; clear pending physics so the ball
  // is drawn at the nozzle for at least one frame instead of jumping mid-arc.
  resetStepAccumulator();
  deps.machineBallMeta.set(ball.body, {
    presetId: preset.id,
    countedLanding: false,
    isOpeningServe: preset.mode === 'serve',
    shownImpactCount: 0,
  });
  updateMachinePose(solution);
  targetMarker.position.set(solution.targetMm.x, deps.TABLE_TOP_Y + LANDING_DISC_CLEARANCE_MM, solution.targetMm.z);
  const isOpeningServe = preset.mode === 'serve';
  targetMarker.visible = !isOpeningServe;
  firstBounceMarker.visible = false;
  serveTrajectoryLine.visible = isOpeningServe;
  if (isOpeningServe) {
    const sampledServe = sampleTrajectoryDetails(solution, 1.05);
    const firstImpact = sampledServe.tableImpacts[0];
    const secondImpact = sampledServe.tableImpacts[1];
    firstBounceMarker.visible = Boolean(firstImpact);
    targetMarker.visible = Boolean(secondImpact);
    if (firstImpact) {
      firstBounceMarker.position.set(
        firstImpact.x,
        deps.TABLE_TOP_Y + LANDING_DISC_CLEARANCE_MM + 1,
        firstImpact.z,
      );
    }
    if (secondImpact) {
      targetMarker.position.set(
        secondImpact.x,
        deps.TABLE_TOP_Y + LANDING_DISC_CLEARANCE_MM,
        secondImpact.z,
      );
    }
    serveTrajectoryLine.geometry.dispose();
    serveTrajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints(
      sampledServe.points.map(point => new THREE.Vector3(point.x, point.y, point.z)),
    );
    serveTrajectoryLine.computeLineDistances();
  }
  machineShotCount += 1;
  document.getElementById('machine-shot-count')!.textContent = String(machineShotCount);
  updateMachineDetails(solution);
  return ball;
}

function setMachineRunning(running: boolean): void {
  if (running) {
    deps.exitTopicDemo();
    deps.stopTrackingDemo();
  }
  machineRunning = running;
  nextMachineShotAt = performance.now();
  machineToggleEl.classList.toggle('active', running);
  machineToggleEl.textContent = running ? '暂停连续 [P]' : '连续发球 [P]';
  updateMachineOperatingStatus();
  deps.syncWindowIndicators();
}

function resetMachineVisualsForClear(): void {
  setMachineRunning(false);
  setMachineVisible(true);
  targetDepthOverrideMm = null;
  targetMarker.visible = false;
  firstBounceMarker.visible = false;
  serveTrajectoryLine.visible = false;
}

function incrementLandingCount(): void {
  machineLandingCount += 1;
  document.getElementById('machine-land-count')!.textContent = String(machineLandingCount);
}
//#endregion

//#region 业务逻辑
function updateMachineOperatingStatus(): void {
  let text = '已停止';
  if (machineRunning) {
    text = '独立连续运行';
  } else if (deps.isTrackingEnabled()) {
    if (deps.isTrackingReplayMode()) text = '跟球联动 · 慢放';
    else if (deps.isTrackingContinuous()) text = '跟球联动 · 连续';
    else if (deps.hasTrackingSession()) text = '跟球联动 · 单球';
    else text = '跟球联动 · 已完成';
  }
  machineStatusEl.textContent = text;
  machineStatusEl.classList.toggle('running', machineRunning);
  machineStatusEl.classList.toggle('linked', !machineRunning && deps.isTrackingEnabled());
}
//#endregion

//#region 方法/工具
function createLandingDiscMarker(radiusMm: number, tubeMm: number, color: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radiusMm, tubeMm, 10, 40), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}
//#endregion
