//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  BOUNCE_REQUIRED_TECHNIQUES,
  CONTACT_TECHNIQUES,
  TABLE_CONTACT_AFTER_BOUNCE_MM,
  TABLE_TECHNIQUES,
  type ContactTechnique,
} from '../domain/contactRules';
import { captureQuickViewBase, clearQuickViewBase } from '../highArcFraming';
import type { PlayerLevel, ShotPreset, TargetLane } from '../serveMachine';
import { initContactGuide, type ContactGuideApi } from './contactGuide';

//#endregion

//#region 常量/配置
const RECEIVER_LEVEL_KEY = 'pingpong-receiver-level-v1';
const STANCE_MODE_KEY = 'pingpong-stance-mode-v1';

const RECEIVER_PROFILES: Record<PlayerLevel, ReceiverProfile> = {
  beginner: { label: '业余入门', reactionMs: 350, moveSpeedMmPerSec: 1200, lateralReachMm: 260, reachAllowanceMm: 220 },
  club: { label: '业余俱乐部', reactionMs: 250, moveSpeedMmPerSec: 1600, lateralReachMm: 330, reachAllowanceMm: 280 },
  advanced: { label: '专业训练', reactionMs: 170, moveSpeedMmPerSec: 2100, lateralReachMm: 390, reachAllowanceMm: 340 },
  world: { label: '世界级参考', reactionMs: 120, moveSpeedMmPerSec: 2600, lateralReachMm: 450, reachAllowanceMm: 400 },
};

const VIEW_STANCES: Record<ViewStance, { x: number; z: number; label: string }> = {
  near: { x: 3050, z: -762.5, label: '近台' },
  mid: { x: 3600, z: -762.5, label: '中台' },
  far: { x: 4500, z: -762.5, label: '远台' },
  forehand: { x: 3300, z: -1305, label: '正手位' },
  middle: { x: 3300, z: -762.5, label: '中路' },
  backhand: { x: 3300, z: -220, label: '反手位' },
};
//#endregion

//#region 模型/类型
export type ViewStance = 'near' | 'mid' | 'far' | 'forehand' | 'middle' | 'backhand';
export type StanceMode = 'fixed' | 'auto';
export interface StancePose { x: number; z: number; label: string; }
export interface ReceiverProfile {
  label: string;
  reactionMs: number;
  moveSpeedMmPerSec: number;
  lateralReachMm: number;
  reachAllowanceMm: number;
}
export type QuickViewId = 'follow' | 'referee' | 'god' | 'audience' | 'endline' | 'side';
type QuickViewPreset = { position: [number, number, number]; target: [number, number, number]; label: string };

export interface ReceiveStanceDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  TABLE_TOP_Y: number;
  TABLE_CENTER_X: number;
  TABLE_CENTER_Z: number;
  VENUE_WIDTH: number;
  getActivePreset: () => ShotPreset;
  getTargetLane: () => TargetLane;
  isTrackingReplayMode: () => boolean;
  getTrackingReplayMesh: () => THREE.Object3D;
  isTrackingEnabled: () => boolean;
  onStartTrackingDemo: () => void;
}

export interface ReceiveStanceApi extends ContactGuideApi {
  applyViewPreset: () => void;
  applyQuickView: (id: QuickViewId) => void;
  applyDemoObserverSetup: (scenario?: { eyeHeightMm: number; stance: ViewStance }) => void;
  setQuickViewActive: (id: QuickViewId) => void;
  hasLockedQuickView: () => boolean;
  effectiveStancePose: () => StancePose;
  resetAutomaticStance: (moveCamera?: boolean) => void;
  moveAutomaticStanceForBall: (ballPoint: THREE.Vector3, velocity: { x: number; z: number }, deltaSeconds: number) => void;
  contactFailureReason: (ballPoint: THREE.Vector3, guide: THREE.Vector3, tableImpacts: number, remainingSeconds?: number) => string | null;
  updateStanceDisplay: () => void;
  currentReceiverProfile: () => ReceiverProfile;
  updateReceiverLevelDisplay: () => void;
  persistReceiverLevel: () => void;
  persistStanceMode: () => void;
  configuredContactZ: () => number;
  requiredReceiveBounceCount: () => number;
  readonly quickViews: Record<Exclude<QuickViewId, 'follow'>, QuickViewPreset>;
  readonly receiverLevelEl: HTMLInputElement;
  readonly activeQuickView: QuickViewId;
  contactTechnique: ContactTechnique;
  trackedReceiveBounceX: number | null;
  stanceMode: StanceMode;
  viewStance: ViewStance;
  viewHeightMm: number;
  receiverLevel: PlayerLevel;
  autoContactZ: number;
  /** When set, auto footwork depth follows this X (mm) instead of technique default. */
  autoDepthOverrideX: number | null;
}
//#endregion

//#region 私有成员
let receiveStanceDeps!: ReceiveStanceDeps;
let quickViews!: Record<Exclude<QuickViewId, 'follow'>, QuickViewPreset>;
let receiverLevelEl!: HTMLInputElement;

let viewHeightMm = 1600;
let viewStance: ViewStance = 'mid';
let stanceMode: StanceMode = 'fixed';
let receiverLevel: PlayerLevel = 'club';
let autoContactZ = 0;
let autoDepthOverrideX: number | null = null;
let activeQuickView: QuickViewId = 'follow';
let contactTechnique: ContactTechnique = 'forehand-loop';
let trackedReceiveBounceX: number | null = null;
let contactGuideApi!: ContactGuideApi;

function readStanceMode(): StanceMode {
  try { return localStorage.getItem(STANCE_MODE_KEY) === 'auto' ? 'auto' : 'fixed'; }
  catch { return 'fixed'; }
}

function readReceiverLevel(): PlayerLevel {
  try {
    const saved = localStorage.getItem(RECEIVER_LEVEL_KEY) as PlayerLevel | null;
    return saved && saved in RECEIVER_PROFILES ? saved : 'club';
  } catch { return 'club'; }
}
//#endregion

//#region 公开 API
export function initReceiveStance(deps: ReceiveStanceDeps): ReceiveStanceApi {
  receiveStanceDeps = deps;
  stanceMode = readStanceMode();
  receiverLevel = readReceiverLevel();
  autoContactZ = deps.TABLE_CENTER_Z;
  quickViews = {
    referee: { position: [1450, 1750, 1050], target: [1370, deps.TABLE_TOP_Y + 120, deps.TABLE_CENTER_Z], label: '裁判视角' },
    god: { position: [1370, 6200, -762.5], target: [1370, deps.TABLE_TOP_Y, -762.5], label: '上帝视角' },
    audience: { position: [5200, 3000, 3600], target: [1370, deps.TABLE_TOP_Y + 120, deps.TABLE_CENTER_Z], label: '观众席' },
    endline: { position: [4300, 1750, -762.5], target: [1370, deps.TABLE_TOP_Y + 180, deps.TABLE_CENTER_Z], label: '端线后方' },
    side: { position: [1370, 1850, -4200], target: [1370, deps.TABLE_TOP_Y + 120, deps.TABLE_CENTER_Z], label: '侧面看台' },
  };
  receiverLevelEl = document.getElementById('receiver-level') as HTMLInputElement;

  const contactGuide = initContactGuide({
    scene: deps.scene,
    TABLE_TOP_Y: deps.TABLE_TOP_Y,
    getActivePreset: deps.getActivePreset,
    getContactTechnique: () => contactTechnique,
    setContactTechnique: (value: ContactTechnique) => { contactTechnique = value; },
    effectiveStancePose,
    updateStanceDisplay,
    resetAutomaticStance,
    tableTechniqueContactX,
    getViewHeightMm: () => viewHeightMm,
    getStanceMode: () => stanceMode,
    getViewStance: () => viewStance,
    isTrackingEnabled: deps.isTrackingEnabled,
    onStartTrackingDemo: deps.onStartTrackingDemo,
  });
  contactGuideApi = contactGuide;

  document.querySelectorAll<HTMLButtonElement>('[data-view-height]').forEach(button => {
    button.addEventListener('click', () => {
      viewHeightMm = Number(button.dataset.viewHeight);
      applyViewPreset();
      contactGuideApi.updateContactGuide();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-view-stance]').forEach(button => {
    button.addEventListener('click', () => {
      stanceMode = 'fixed';
      viewStance = button.dataset.viewStance as ViewStance;
      persistStanceMode();
      applyViewPreset();
      contactGuideApi.updateContactGuide();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-stance-mode]').forEach(button => {
    button.addEventListener('click', () => {
      stanceMode = button.dataset.stanceMode as StanceMode;
      if (stanceMode === 'auto') autoContactZ = configuredContactZ();
      persistStanceMode();
      applyViewPreset();
      contactGuideApi.updateContactGuide();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-quick-view]').forEach(button => {
    button.addEventListener('click', () => applyQuickView(button.dataset.quickView as QuickViewId));
  });
  receiverLevelEl.addEventListener('change', () => {
    receiverLevel = receiverLevelEl.value as PlayerLevel;
    persistReceiverLevel();
    updateReceiverLevelDisplay();
    resetAutomaticStance(true);
    contactGuideApi.updateContactGuide(deps.isTrackingEnabled());
    if (deps.isTrackingEnabled()) deps.onStartTrackingDemo();
  });

  return {
    ...contactGuide,
    applyViewPreset,
    applyQuickView,
    applyDemoObserverSetup,
    setQuickViewActive,
    hasLockedQuickView,
    effectiveStancePose,
    resetAutomaticStance,
    moveAutomaticStanceForBall,
    contactFailureReason,
    updateStanceDisplay,
    currentReceiverProfile,
    updateReceiverLevelDisplay,
    persistReceiverLevel,
    persistStanceMode,
    configuredContactZ,
    requiredReceiveBounceCount,
    get quickViews() { return quickViews; },
    get receiverLevelEl() { return receiverLevelEl; },
    get activeQuickView() { return activeQuickView; },
    get contactTechnique() { return contactTechnique; },
    set contactTechnique(value: ContactTechnique) { contactTechnique = value; },
    get trackedReceiveBounceX() { return trackedReceiveBounceX; },
    set trackedReceiveBounceX(value: number | null) { trackedReceiveBounceX = value; },
    get stanceMode() { return stanceMode; },
    set stanceMode(value: StanceMode) { stanceMode = value; },
    get viewStance() { return viewStance; },
    set viewStance(value: ViewStance) { viewStance = value; },
    get viewHeightMm() { return viewHeightMm; },
    set viewHeightMm(value: number) { viewHeightMm = value; },
    get receiverLevel() { return receiverLevel; },
    set receiverLevel(value: PlayerLevel) { receiverLevel = value; },
    get autoContactZ() { return autoContactZ; },
    set autoContactZ(value: number) { autoContactZ = value; },
    get autoDepthOverrideX() { return autoDepthOverrideX; },
    set autoDepthOverrideX(value: number | null) { autoDepthOverrideX = value; },
  };
}

function hasLockedQuickView(): boolean {
  return activeQuickView !== 'follow';
}

function setQuickViewActive(id: QuickViewId): void {
  activeQuickView = id;
  document.querySelectorAll<HTMLButtonElement>('[data-quick-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.quickView === id);
  });
}

function applyViewPreset(): void {
  const deps = receiveStanceDeps;
  clearQuickViewBase(deps.camera, deps.controls);
  const stance = effectiveStancePose();
  deps.camera.position.set(stance.x, viewHeightMm, stance.z);
  deps.controls.target.set(deps.TABLE_CENTER_X, deps.TABLE_TOP_Y + 180, deps.TABLE_CENTER_Z);
  if (Math.abs(deps.camera.fov - 45) > 1e-3) {
    deps.camera.fov = 45;
    deps.camera.updateProjectionMatrix();
  }
  deps.controls.update();
  setQuickViewActive('follow');
  document.querySelectorAll<HTMLButtonElement>('[data-view-height]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.viewHeight) === viewHeightMm);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-view-stance]').forEach(button => {
    button.classList.toggle('active', button.dataset.viewStance === viewStance);
    button.disabled = stanceMode === 'auto';
  });
  updateStanceDisplay();
}

function applyDemoObserverSetup(scenario?: { eyeHeightMm: number; stance: ViewStance }): void {
  // Topic demos always start in auto footwork; the user can still switch to fixed.
  stanceMode = 'auto';
  persistStanceMode();
  if (scenario) {
    viewHeightMm = scenario.eyeHeightMm;
    viewStance = scenario.stance;
  }
  // Locked quick views keep the chosen camera; only refresh stance UI.
  if (hasLockedQuickView()) {
    updateStanceDisplay();
    return;
  }
  applyViewPreset();
}

function applyQuickView(id: QuickViewId): void {
  const deps = receiveStanceDeps;
  if (id === 'follow') {
    applyViewPreset();
    const replayMesh = deps.getTrackingReplayMesh();
    if (deps.isTrackingReplayMode() && replayMesh.visible) {
      deps.controls.target.copy(replayMesh.position);
      deps.controls.update();
    }
    contactGuideApi.updateContactGuide();
    return;
  }
  const preset = quickViews[id];
  deps.camera.fov = 45;
  deps.camera.updateProjectionMatrix();
  deps.camera.position.set(...preset.position);
  deps.controls.target.set(...preset.target);
  deps.controls.enabled = true;
  deps.controls.update();
  captureQuickViewBase(deps.camera, deps.controls, 45);
  setQuickViewActive(id);
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${preset.label}</strong>：观察球台整体空间关系；物理模拟仍按正常时间推进。`;
}

function updateReceiverLevelDisplay(): void {
  const profile = currentReceiverProfile();
  receiverLevelEl.value = receiverLevel;
  document.getElementById('receiver-level-status')!.innerHTML =
    `<strong>${profile.label}</strong>：反应约 ${profile.reactionMs} ms · 自动步速 ${(profile.moveSpeedMmPerSec / 1000).toFixed(1)} m/s · 横向触及 ${profile.lateralReachMm} mm`;
}

function persistReceiverLevel(): void {
  try { localStorage.setItem(RECEIVER_LEVEL_KEY, receiverLevel); } catch { /* private mode */ }
}

function persistStanceMode(): void {
  try { localStorage.setItem(STANCE_MODE_KEY, stanceMode); } catch { /* private mode */ }
}

function updateStanceDisplay(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-stance-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.stanceMode === stanceMode);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-view-stance]').forEach(button => {
    button.disabled = stanceMode === 'auto';
  });
  const pose = effectiveStancePose();
  document.getElementById('stance-status')!.innerHTML =
    `<strong>当前身位：</strong>${stanceMode === 'auto' ? `自动 · ${pose.label}` : `固定 · ${pose.label}`}`;
}
//#endregion

//#region 业务逻辑
function requiredReceiveBounceCount(): number {
  // A serve has already bounced once on the server's side. The receiver may
  // only play it after the second table impact; a normal fed ball is playable
  // after its first impact on the receiver's side.
  return receiveStanceDeps.getActivePreset().mode === 'serve' ? 2 : 1;
}

function tableTechniqueContactX(technique: ContactTechnique): number {
  const receiverBounceX = trackedReceiveBounceX ?? receiveStanceDeps.getActivePreset().targetDepthMm;
  return THREE.MathUtils.clamp(
    receiverBounceX + TABLE_CONTACT_AFTER_BOUNCE_MM[technique],
    receiveStanceDeps.TABLE_CENTER_X + 120,
    2660,
  );
}

function currentReceiverProfile(): ReceiverProfile {
  return RECEIVER_PROFILES[receiverLevel];
}

function configuredContactZ(): number {
  const lane = receiveStanceDeps.getTargetLane();
  if (lane === 'forehand') return -1305;
  if (lane === 'backhand') return -220;
  return receiveStanceDeps.TABLE_CENTER_Z;
}

function autoStanceDepth(technique: ContactTechnique): { x: number; label: string } {
  if (autoDepthOverrideX !== null) {
    return { x: autoDepthOverrideX, label: '后退等下降' };
  }
  const spec = CONTACT_TECHNIQUES[technique];
  if (TABLE_TECHNIQUES.has(technique)) {
    return { x: Math.max(2760, tableTechniqueContactX(technique) + spec.forwardMm), label: '台内近台' };
  }
  if (technique === 'block' || technique === 'punch' || technique === 'forehand-drive') return { x: 3150, label: '近台' };
  if (technique === 'chop') return { x: 4250, label: '远台削球' };
  if (technique === 'lob') return { x: 4500, label: '远台防守' };
  // After a lob bounce near mid-depth, stand just behind the end line and
  // reach forward to the post-bounce apex / early descent.
  if (technique === 'smash') return { x: 2880, label: '中近台进攻' };
  return { x: 3600, label: '中台进攻' };
}

function effectiveStancePose(): StancePose {
  if (stanceMode === 'fixed') return VIEW_STANCES[viewStance];
  const deps = receiveStanceDeps;
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  const depth = autoStanceDepth(contactTechnique);
  const z = THREE.MathUtils.clamp(autoContactZ - spec.lateralMm, deps.TABLE_CENTER_Z - deps.VENUE_WIDTH / 2 + 600, deps.TABLE_CENTER_Z + deps.VENUE_WIDTH / 2 - 600);
  const laneLabel = autoContactZ < deps.TABLE_CENTER_Z - 220 ? '正手位' : autoContactZ > deps.TABLE_CENTER_Z + 220 ? '反手位' : '中路';
  const forehandTechnique = contactTechnique.startsWith('forehand') || contactTechnique === 'counter-loop' || contactTechnique === 'smash';
  const backhandTechnique = contactTechnique.startsWith('backhand');
  const tacticalLabel = laneLabel === '反手位' && forehandTechnique
    ? '反手位侧身正手'
    : laneLabel === '正手位' && backhandTechnique
      ? '正手位大跨步反手'
      : laneLabel;
  return { x: depth.x, z, label: `${tacticalLabel} · ${depth.label} · ${spec.label}` };
}

function contactFailureReason(ballPoint: THREE.Vector3, guide: THREE.Vector3, tableImpacts: number, remainingSeconds = 0): string | null {
  const deps = receiveStanceDeps;
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  const receiver = currentReceiverProfile();
  const receiveBounceCount = requiredReceiveBounceCount();
  if (BOUNCE_REQUIRED_TECHNIQUES.has(contactTechnique) && tableImpacts < receiveBounceCount) {
    return '来球尚未在接球方台面落台，空中直接拦截属违例';
  }
  if (TABLE_TECHNIQUES.has(contactTechnique) && tableImpacts > receiveBounceCount) {
    return '错过接球方落台后、下一跳前的台内击球时机';
  }
  const longitudinalOvershoot = ballPoint.x - guide.x;
  if (longitudinalOvershoot > 380) {
    return `反应偏慢，球已越过建议击球位置 ${Math.round(longitudinalOvershoot)} mm`;
  }
  const lateralError = Math.abs(ballPoint.z - guide.z);
  if (lateralError > receiver.lateralReachMm) return `横向差 ${Math.round(lateralError)} mm，球已超出${receiver.label}的可触及范围`;
  if (stanceMode === 'auto') {
    const pose = effectiveStancePose();
    const unfinishedMove = Math.hypot(deps.camera.position.x - pose.x, deps.camera.position.z - pose.z);
    const reachableMovement = remainingSeconds * receiver.moveSpeedMmPerSec + receiver.reachAllowanceMm;
    if (unfinishedMove > reachableMovement) return `移动还差 ${Math.round(unfinishedMove)} mm，未能及时到达${pose.label}`;
  } else {
    const forwardReach = Math.abs(deps.camera.position.x - guide.x);
    if (forwardReach > spec.forwardMm + 320) return `固定${VIEW_STANCES[viewStance].label}距离击球点过远`;
  }
  return null;
}

function resetAutomaticStance(moveCamera = false): void {
  autoDepthOverrideX = null;
  if (stanceMode !== 'auto') return;
  autoContactZ = configuredContactZ();
  updateStanceDisplay();
  if (moveCamera) applyViewPreset();
}

function moveAutomaticStanceForBall(ballPoint: THREE.Vector3, velocity: { x: number; z: number }, deltaSeconds: number): void {
  if (stanceMode !== 'auto') return;
  const deps = receiveStanceDeps;
  const depth = autoStanceDepth(contactTechnique);
  const guideX = TABLE_TECHNIQUES.has(contactTechnique)
    ? tableTechniqueContactX(contactTechnique)
    : depth.x - CONTACT_TECHNIQUES[contactTechnique].forwardMm;
  if (velocity.x > 0.05 && ballPoint.x < guideX) {
    const seconds = (guideX - ballPoint.x) / (velocity.x * 1000);
    if (seconds > 0 && seconds < 1.5) {
      autoContactZ = THREE.MathUtils.clamp(ballPoint.z + velocity.z * 1000 * seconds, deps.TABLE_CENTER_Z - 820, deps.TABLE_CENTER_Z + 820);
    }
  }
  const pose = effectiveStancePose();
  const maximumStep = currentReceiverProfile().moveSpeedMmPerSec * deltaSeconds;
  const dx = pose.x - deps.camera.position.x;
  const dz = pose.z - deps.camera.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0.5) {
    const scale = Math.min(1, maximumStep / distance);
    deps.camera.position.x += dx * scale;
    deps.camera.position.z += dz * scale;
  }
  updateStanceDisplay();
}
//#endregion

//#region 方法/工具
//#endregion
