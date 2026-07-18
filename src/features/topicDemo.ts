//#region 导入/依赖
import * as THREE from 'three';
import type { RapierBall } from '../physics';
import { clampWindowPosition, setWindowOpen } from '../ui/windowManager';
import {
  getPreset,
  sampleTrajectory,
  type LaunchSolution,
  type PlayerLevel,
  type TargetLane,
} from '../serveMachine';
import type { ContactTechnique } from '../domain/contactRules';
import type { ReceiveStanceApi, ViewStance } from './receiveStance';
import type { MachineUiApi } from './machineUi';
import type { TrackingDemoApi } from './trackingDemo';
import type { TrackingReplayApi } from './trackingReplay';

//#endregion

//#region 常量/配置
//#endregion
//#region 模型/类型
export type DemoId = 'topspin' | 'child-lob' | 'child-triangle' | 'low-stance';
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
  startPresetTopicDemo: (id: Exclude<DemoId, 'topspin'>, variant?: DemoVariant) => Promise<void>;
  setActiveDemoItem: (id: DemoId | null) => void;
  isDemoActive: () => boolean;
  setDemoActive: (value: boolean) => void;
}
//#endregion

//#region 私有成员
const DEMO_SCENARIOS: Record<Exclude<DemoId, 'topspin'>, DemoScenario> = {
  'child-lob': {
    presetId: 'lob', eyeHeightMm: 950, stance: 'far', lane: 'middle',
    technique: 'smash', strength: 100, playerLevel: 'club', receiverLevel: 'club',
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
      else void startPresetTopicDemo(id);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-demo-variant]').forEach(button => {
    button.addEventListener('click', () => {
      const variant = button.dataset.demoVariant as DemoVariant;
      const item = button.closest<HTMLElement>('[data-demo-item]');
      const id = item?.dataset.demoItem as Exclude<DemoId, 'topspin'> | undefined;
      if (id) void startPresetTopicDemo(id, variant);
    });
  });
  updateDemo();
  deps.syncWindowIndicators();

  return {
    fireDemo,
    updateDemo,
    clearDemoLines,
    startPresetTopicDemo,
    setActiveDemoItem,
    isDemoActive: () => demoActive,
    setDemoActive: (value: boolean) => { demoActive = value; },
  };
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

async function startPresetTopicDemo(id: Exclude<DemoId, 'topspin'>, variant?: DemoVariant): Promise<void> {
  const base = DEMO_SCENARIOS[id];
  const scenario: DemoScenario = { ...base };
  if (variant === 'child-lob-adult' || variant === 'child-triangle-adult') scenario.eyeHeightMm = 1600;
  if (variant === 'stance-high') scenario.eyeHeightMm = 1800;

  deps.trackingDemo.stopTrackingDemo(false);
  deps.machineUiApi.setMachineRunning(false);
  strengthEl.value = String(scenario.strength);
  levelEl.value = scenario.playerLevel;
  deps.receiveStance.receiverLevel = scenario.receiverLevel;
  laneEl.value = scenario.lane;
  randomizeEl.checked = false;
  deps.trackingDemo.setContinuousChecked(false);
  deps.trackingReplay.enableAutoReplayForDemo();
  deps.machineUiApi.setActivePreset(getPreset(scenario.presetId), false);
  deps.receiveStance.contactTechnique = deps.receiveStance.preferTechniqueForPreset(deps.machineUiApi.activePreset);
  deps.receiveStance.updateTechniqueOptions();
  deps.machineUiApi.syncAllFlatChoices();
  deps.receiveStance.updateReceiverLevelDisplay();
  deps.machineUiApi.updateMachineDetails();
  deps.receiveStance.applyDemoObserverSetup(scenario);
  deps.receiveStance.updateContactGuide(false);

  await deps.trackingDemo.startTrackingDemo();
  demoActive = true;
  setActiveDemoItem(id);
  setWindowOpen('tracking-window', true);
  deps.syncWindowIndicators();
}

async function fireDemo(): Promise<void> {
  // Use the current sliders as-is. Unmodified controls already hold the topic defaults.
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
  setActiveDemoItem('topspin');
  deps.syncWindowIndicators();
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
