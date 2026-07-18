//#region 导入/依赖
import * as THREE from 'three';
import {
  CONTACT_TECHNIQUES,
  TABLE_TECHNIQUES,
  type ContactTechnique,
} from '../domain/contactRules';
import { getShotKnowledge, type ShotPreset } from '../serveMachine';
import type { StanceMode, StancePose, ViewStance } from './receiveStance';

//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
export type ContactGuideState = 'hittable' | 'unreachable';

export interface ContactGuideDeps {
  scene: THREE.Scene;
  TABLE_TOP_Y: number;
  getActivePreset: () => ShotPreset;
  getContactTechnique: () => ContactTechnique;
  setContactTechnique: (value: ContactTechnique) => void;
  effectiveStancePose: () => StancePose;
  updateStanceDisplay: () => void;
  resetAutomaticStance: (moveCamera?: boolean) => void;
  tableTechniqueContactX: (technique: ContactTechnique) => number;
  getViewHeightMm: () => number;
  getStanceMode: () => StanceMode;
  getViewStance: () => ViewStance;
  isTrackingEnabled: () => boolean;
  onStartTrackingDemo: () => void;
}

export interface ContactGuideApi {
  contactGuidePosition: () => THREE.Vector3;
  updateContactGuide: (show?: boolean) => void;
  placeContactGuide: (point: THREE.Vector3, show: boolean) => void;
  setContactGuideState: (state: ContactGuideState) => void;
  clearReceiveFailureFeedback: () => void;
  showReceiveFailure: (reason: string) => void;
  pinMissedPreferredMarker: (point: THREE.Vector3) => void;
  clearMissedPreferredMarker: () => void;
  updateTechniqueOptions: () => void;
  preferTechniqueForPreset: (preset: ShotPreset) => ContactTechnique;
  availableTechniquesForPreset: (preset: ShotPreset) => ContactTechnique[];
  readonly contactGuideMarker: THREE.Mesh;
  readonly actualContactMarker: THREE.Mesh;
  readonly missedPreferredMarker: THREE.Mesh;
  readonly contactLink: THREE.Line;
  readonly trackingTrailLine: THREE.Line;
  trackingTrailPoints: THREE.Vector3[];
}
//#endregion

//#region 私有成员
let contactGuideDeps!: ContactGuideDeps;
let receiveFailureTimer: number | null = null;
let trackingTrailPoints: THREE.Vector3[] = [];

const contactGuideMaterial = new THREE.MeshBasicMaterial({ color: 0x54d6ff, wireframe: true, transparent: true, opacity: 0.95 });
const contactGuideMarker = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 12), contactGuideMaterial);
const actualContactMarker = new THREE.Mesh(
  new THREE.SphereGeometry(34, 18, 14),
  new THREE.MeshBasicMaterial({ color: 0x35e87b, wireframe: true, transparent: true, opacity: 0.95 }),
);
const missedPreferredMarker = new THREE.Mesh(
  new THREE.SphereGeometry(28, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xff6b4a, wireframe: true, transparent: true, opacity: 0.95 }),
);
const contactLink = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0x54d6ff, dashSize: 45, gapSize: 24, transparent: true, opacity: 0.7 }),
);
const trackingTrailLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0x9ceaff, transparent: true, opacity: 0.82 }),
);
contactGuideMarker.visible = actualContactMarker.visible = missedPreferredMarker.visible = contactLink.visible = false;
trackingTrailLine.visible = false;
//#endregion

//#region 公开 API
export function initContactGuide(deps: ContactGuideDeps): ContactGuideApi {
  contactGuideDeps = deps;
  deps.scene.add(contactGuideMarker, actualContactMarker, missedPreferredMarker, contactLink, trackingTrailLine);

  document.querySelectorAll<HTMLButtonElement>('[data-contact-technique]').forEach(button => {
    button.addEventListener('click', () => {
      const wasTracking = deps.isTrackingEnabled();
      deps.setContactTechnique(button.dataset.contactTechnique as ContactTechnique);
      document.querySelectorAll<HTMLButtonElement>('[data-contact-technique]').forEach(item => {
        item.classList.toggle('active', item === button);
      });
      deps.resetAutomaticStance(true);
      updateContactGuide(wasTracking);
      if (wasTracking) deps.onStartTrackingDemo();
    });
  });

  return {
    contactGuidePosition,
    updateContactGuide,
    placeContactGuide,
    setContactGuideState,
    clearReceiveFailureFeedback,
    showReceiveFailure,
    pinMissedPreferredMarker,
    clearMissedPreferredMarker,
    updateTechniqueOptions,
    preferTechniqueForPreset,
    availableTechniquesForPreset,
    get contactGuideMarker() { return contactGuideMarker; },
    get actualContactMarker() { return actualContactMarker; },
    get missedPreferredMarker() { return missedPreferredMarker; },
    get contactLink() { return contactLink; },
    get trackingTrailLine() { return trackingTrailLine; },
    get trackingTrailPoints() { return trackingTrailPoints; },
    set trackingTrailPoints(value: THREE.Vector3[]) { trackingTrailPoints = value; },
  };
}

function setContactGuideState(state: ContactGuideState): void {
  contactGuideMarker.userData.receiveState = state;
  const stanceStatus = document.getElementById('stance-status');
  if (stanceStatus) stanceStatus.dataset.guideState = state;
}

function contactGuidePosition(): THREE.Vector3 {
  const deps = contactGuideDeps;
  const stance = deps.effectiveStancePose();
  const technique = deps.getContactTechnique();
  const spec = CONTACT_TECHNIQUES[technique];
  const viewHeightMm = deps.getViewHeightMm();
  const heightAdjustment = (viewHeightMm - 1600) * 0.22;
  const stanceMode = deps.getStanceMode();
  const viewStance = deps.getViewStance();
  // Once the player has already moved to the wide forehand/backhand lane,
  // the contact point shifts back toward the table centre; otherwise applying
  // the full body-relative offset would place the racket outside the table.
  const lateralMm = stanceMode === 'fixed' && viewStance === 'forehand' && technique.startsWith('forehand')
    ? 80
    : stanceMode === 'fixed' && viewStance === 'backhand' && technique === 'backhand-loop'
      ? -80
      : spec.lateralMm;
  return new THREE.Vector3(
    TABLE_TECHNIQUES.has(technique) ? deps.tableTechniqueContactX(technique) : stance.x - spec.forwardMm,
    deps.TABLE_TOP_Y + spec.aboveTableMm + heightAdjustment,
    stance.z + lateralMm,
  );
}

function placeContactGuide(point: THREE.Vector3, show: boolean): void {
  const stance = contactGuideDeps.effectiveStancePose();
  const viewHeightMm = contactGuideDeps.getViewHeightMm();
  contactGuideMarker.position.copy(point);
  contactGuideMarker.visible = show;
  contactLink.visible = show;
  contactLink.geometry.dispose();
  contactLink.geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(stance.x, Math.max(900, viewHeightMm * 0.72), stance.z),
    point,
  ]);
  contactLink.computeLineDistances();
}

function updateContactGuide(show = contactGuideMarker.visible): void {
  const spec = CONTACT_TECHNIQUES[contactGuideDeps.getContactTechnique()];
  const point = contactGuidePosition();
  placeContactGuide(point, show);
  const available = availableTechniquesForPreset(contactGuideDeps.getActivePreset())
    .map(id => CONTACT_TECHNIQUES[id].label).join('、');
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${spec.label}</strong>：${spec.description}<br>击球时机：${spec.timing}<br>` +
    `<span style="color:#8fa1b7">当前球路可处理：${available}<br>网状标识球：青色为建议位置，绿色可处理，红色不可处理</span>`;
  contactGuideDeps.updateStanceDisplay();
}

function clearReceiveFailureFeedback(): void {
  const flash = document.getElementById('receive-failure-flash')!;
  if (receiveFailureTimer !== null) window.clearTimeout(receiveFailureTimer);
  receiveFailureTimer = null;
  flash.classList.remove('active');
  document.getElementById('receive-failure-reason')!.textContent = '接球失败';
}

function showReceiveFailure(reason: string): void {
  const flash = document.getElementById('receive-failure-flash')!;
  if (receiveFailureTimer !== null) window.clearTimeout(receiveFailureTimer);
  document.getElementById('receive-failure-reason')!.textContent = `接球失败 · ${reason}`;
  flash.classList.remove('active');
  void flash.offsetWidth;
  flash.classList.add('active');
  receiveFailureTimer = window.setTimeout(() => {
    flash.classList.remove('active');
    receiveFailureTimer = null;
  }, 720);
}

function pinMissedPreferredMarker(point: THREE.Vector3): void {
  missedPreferredMarker.position.copy(point);
  missedPreferredMarker.visible = true;
}

function clearMissedPreferredMarker(): void {
  missedPreferredMarker.visible = false;
}

function updateTechniqueOptions(): void {
  const deps = contactGuideDeps;
  const available = availableTechniquesForPreset(deps.getActivePreset());
  if (!available.includes(deps.getContactTechnique())) deps.setContactTechnique(available[0]);
  const activeTechnique = deps.getContactTechnique();
  document.querySelectorAll<HTMLButtonElement>('[data-contact-technique]').forEach(button => {
    const technique = button.dataset.contactTechnique as ContactTechnique;
    button.hidden = !available.includes(technique);
    button.classList.toggle('active', technique === activeTechnique);
    button.title = button.hidden ? '' : `${CONTACT_TECHNIQUES[technique].label}：${CONTACT_TECHNIQUES[technique].timing}`;
  });
  const status = document.getElementById('tracking-status');
  if (status) {
    const labels = available.map(id => CONTACT_TECHNIQUES[id].label).join('、');
    status.dataset.availableTechniques = labels;
  }
}
//#endregion

//#region 业务逻辑
function availableTechniquesForPreset(preset: ShotPreset): ContactTechnique[] {
  const knowledge = getShotKnowledge(preset);
  const short = knowledge.length === 'short';
  const halfLong = knowledge.length === 'half-long';
  const heavyBackspin = preset.topRpm <= -2500;
  const heavyTopspin = preset.topRpm >= 2500;
  const lowSpin = Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm) < 1000;
  const rubber = knowledge.commonRubbers[0];
  if (rubber === 'anti-spin') return ['punch', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'drop-shot', 'long-push'];
  if (rubber === 'long-pips' && lowSpin) return ['punch', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'drop-shot', 'long-push'];
  if (rubber === 'long-pips' && heavyBackspin) return ['forehand-loop', 'backhand-loop', 'lift', 'long-push', 'chop'];
  if (rubber === 'medium-pips') return ['punch', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'block', 'lift'];
  if (rubber === 'short-pips') return ['block', 'forehand-drive', 'counter-loop', 'forehand-loop', 'backhand-loop', 'chop'];
  if (short && heavyBackspin) return ['drop-shot', 'push', 'long-push', 'lift', 'backhand-flick', 'forehand-flick', 'forehand-loop'];
  if (short && heavyTopspin) return ['drop-shot', 'block', 'punch', 'backhand-flick', 'forehand-flick', 'long-push'];
  if (short) return ['drop-shot', 'long-push', 'push', 'lift', 'backhand-flick', 'forehand-flick', 'punch'];
  if (halfLong && heavyBackspin) return ['forehand-loop', 'backhand-loop', 'backhand-flick', 'forehand-flick', 'long-push', 'lift', 'chop'];
  if (heavyBackspin) return ['forehand-loop', 'backhand-loop', 'lift', 'long-push', 'chop'];
  if (heavyTopspin) return ['block', 'counter-loop', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'chop', 'lob'];
  if (preset.id === 'lob') return ['smash', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'drop-shot'];
  if (preset.id === 'smash') return ['block', 'chop', 'lob'];
  return ['forehand-drive', 'punch', 'forehand-loop', 'backhand-loop', 'block', 'counter-loop', 'chop'];
}

function preferTechniqueForPreset(preset: ShotPreset): ContactTechnique {
  return availableTechniquesForPreset(preset)[0];
}
//#endregion

//#region 方法/工具
//#endregion
