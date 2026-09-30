//#region 导入/依赖
import * as THREE from 'three';
import type { TableImpactEvent } from '../domain/tableImpact';
//#endregion

//#region 常量/配置
const CUE_LIFETIME_SECONDS = 3.3;
const CUE_START_RADIUS_MM = 28;
const CUE_END_RADIUS_MM = 175;
const FRICTION_ARROW_LENGTH_MM = 190;
const SLIP_ARROW_LENGTH_MM = 150;
const NORMAL_ARROW_LENGTH_MM = 155;
const RESULTANT_ARROW_LENGTH_MM = 205;
const FORCE_PAUSE_SECONDS = 0.42;
const FRICTION_FOCUS_END_SECONDS = 1.10;
const NORMAL_FOCUS_END_SECONDS = 1.78;
//#endregion

//#region 模型/类型
interface ImpactCue {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  frictionArrow: THREE.ArrowHelper;
  slipArrow: THREE.ArrowHelper;
  normalArrow: THREE.ArrowHelper;
  resultantArrow: THREE.ArrowHelper;
  rubbingLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  age: number;
  stage: ForceStage;
  ballLabel: string;
  bounceIndex: number;
  contactSpeed: number;
  before: number;
  after: number;
}

type ForceStage = 'pause' | 'friction' | 'normal' | 'resultant';

export interface RecordingEffectsApi {
  addImpactCue: (
    xMm: number,
    zMm: number,
    color: number,
    bounceIndex: number,
    event: TableImpactEvent,
    ballLabel: string,
  ) => void;
  update: (deltaSeconds: number) => void;
  reset: () => void;
}
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
/**
 * Small, deterministic contact cues for the recording take. They are visual
 * annotations only: the ring is placed at the measured ball/table contact and
 * never replaces the physical ball or trajectory.
 */
export function initRecordingEffects(deps: {
  scene: THREE.Scene;
  tableTopY: number;
  focusBallLabel: string;
}): RecordingEffectsApi {
  const ringGeometry = new THREE.RingGeometry(CUE_START_RADIUS_MM, CUE_START_RADIUS_MM + 8, 32);
  const cues: ImpactCue[] = [];
  const eventEl = document.getElementById('spin-recording-event');
  let eventTimer = 0;
  let activeCue: ImpactCue | null = null;

  const setArrowOpacity = (arrow: THREE.ArrowHelper, opacity: number): void => {
    for (const material of [arrow.line.material, arrow.cone.material]) {
      const materials = Array.isArray(material) ? material : [material];
      for (const item of materials) {
        item.transparent = true;
        item.opacity = opacity;
        item.depthWrite = false;
        item.depthTest = false;
        item.needsUpdate = true;
      }
    }
  };

  const disposeArrow = (arrow: THREE.ArrowHelper): void => {
    deps.scene.remove(arrow);
    arrow.line.geometry.dispose();
    arrow.cone.geometry.dispose();
    const materials = [arrow.line.material, arrow.cone.material];
    for (const material of materials) {
      const list = Array.isArray(material) ? material : [material];
      for (const item of list) item.dispose();
    }
  };

  const disposeCue = (cue: ImpactCue): void => {
    deps.scene.remove(cue.mesh, cue.rubbingLine);
    cue.mesh.material.dispose();
    cue.rubbingLine.geometry.dispose();
    cue.rubbingLine.material.dispose();
    disposeArrow(cue.frictionArrow);
    disposeArrow(cue.slipArrow);
    disposeArrow(cue.normalArrow);
    disposeArrow(cue.resultantArrow);
    if (activeCue === cue) activeCue = null;
  };

  const stageForAge = (age: number): ForceStage => {
    if (age < FORCE_PAUSE_SECONDS) return 'pause';
    if (age < FRICTION_FOCUS_END_SECONDS) return 'friction';
    if (age < NORMAL_FOCUS_END_SECONDS) return 'normal';
    return 'resultant';
  };

  const renderEventCard = (cue: ImpactCue, stage: ForceStage): void => {
    if (!eventEl) return;
    const title = `重点看${deps.focusBallLabel}路线 · ${cue.ballLabel}第 ${cue.bounceIndex} 跳`;
    const metrics = `|v∥| ${cue.contactSpeed.toFixed(2)} m/s · ${cue.before} → ${cue.after} rpm`;
    const line = (className: string, text: string, active: boolean): string =>
      `<span class="force-line ${className}${active ? ' active' : ' muted'}">${text}</span>`;
    if (stage === 'pause') {
      eventEl.innerHTML = `<strong>${title} · 接触停帧</strong><br>` +
        `<span class="force-pause">先停在接触点，接下来依次标出受力</span><br>` +
        `<span class="force-metrics">${metrics}</span>`;
    } else if (stage === 'friction') {
      eventEl.innerHTML = `<strong>${title} · 先看切向摩擦</strong><br>` +
        line('force-on-ball', '橙箭头：台面对球的切向摩擦 ← 抵抗接触点滑动', true) + '<br>' +
        line('force-on-table', '绿箭头：球对台面的擦动 → 方向相反', false) + '<br>' +
        `<span class="force-metrics">${metrics}</span>`;
    } else if (stage === 'normal') {
      eventEl.innerHTML = `<strong>${title} · 再看法向冲量</strong><br>` +
        line('force-normal', '黄箭头：台面对球的法向冲量 ↑', true) + '<br>' +
        line('force-on-ball', '橙箭头：切向摩擦，改变接触点速度', false) + '<br>' +
        `<span class="force-metrics">${metrics}</span>`;
    } else {
      eventEl.innerHTML = `<strong>${title} · 看合力方向</strong><br>` +
        line('force-resultant', '紫箭头：切向摩擦 + 法向冲量的合成方向', true) + '<br>' +
        line('force-on-ball', '橙箭头：台面对球的切向摩擦', false) + '<br>' +
        line('force-normal', '黄箭头：台面的法向冲量 ↑', false) + '<br>' +
        `<span class="force-metrics">${metrics}</span>`;
    }
    eventEl.classList.remove('force-stage-pause', 'force-stage-friction', 'force-stage-normal', 'force-stage-resultant');
    eventEl.classList.add(`force-stage-${stage}`);
  };

  const reset = (): void => {
    for (const cue of cues) disposeCue(cue);
    cues.length = 0;
    activeCue = null;
    eventTimer = 0;
    if (eventEl) {
      eventEl.classList.remove('visible', 'pulse');
      eventEl.classList.remove('force-stage-pause', 'force-stage-friction', 'force-stage-normal', 'force-stage-resultant');
      eventEl.innerHTML = '';
    }
  };

  const addImpactCue = (
    xMm: number,
    zMm: number,
    color: number,
    bounceIndex: number,
    event: TableImpactEvent,
    ballLabel: string,
  ): void => {
    const slip = new THREE.Vector3(event.contactVx, 0, event.contactVz);
    if (slip.lengthSq() < 1e-10) slip.set(1, 0, 0);
    slip.normalize();
    const friction = slip.clone().negate();
    const contact = new THREE.Vector3(xMm, deps.tableTopY + 8, zMm);

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.position.copy(contact);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 4;
    deps.scene.add(mesh);

    // The green vector is the ball's tangential action on the table. The
    // orange vector is the equal-and-opposite friction impulse from the table
    // on the ball. Both are derived from the resolver's measured contact slip.
    const frictionArrow = new THREE.ArrowHelper(
      friction,
      contact.clone().add(new THREE.Vector3(0, 5, 0)),
      FRICTION_ARROW_LENGTH_MM,
      0xffae46,
      34,
      18,
    );
    const slipArrow = new THREE.ArrowHelper(
      slip,
      contact.clone().add(new THREE.Vector3(0, 3, 0)),
      SLIP_ARROW_LENGTH_MM,
      0x5ee6a8,
      30,
      16,
    );
    const normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      contact.clone().add(new THREE.Vector3(0, 2, 0)),
      NORMAL_ARROW_LENGTH_MM,
      0xffe27a,
      36,
      19,
    );
    const resultantVector = new THREE.Vector3(
      friction.x * event.tangentialImpulse,
      event.normalImpulse,
      friction.z * event.tangentialImpulse,
    );
    if (resultantVector.lengthSq() < 1e-12) resultantVector.set(0, 1, 0);
    resultantVector.normalize();
    const resultantArrow = new THREE.ArrowHelper(
      resultantVector,
      contact.clone().add(new THREE.Vector3(0, 12, 0)),
      RESULTANT_ARROW_LENGTH_MM,
      0xff7bf3,
      40,
      22,
    );
    for (const arrow of [frictionArrow, slipArrow, normalArrow, resultantArrow]) {
      arrow.renderOrder = 5;
      setArrowOpacity(arrow, 0);
      deps.scene.add(arrow);
    }

    const rubbingGeometry = new THREE.BufferGeometry().setFromPoints([
      contact.clone().add(slip.clone().multiplyScalar(-125)).setY(deps.tableTopY + 5),
      contact.clone().add(slip.clone().multiplyScalar(125)).setY(deps.tableTopY + 5),
    ]);
    const rubbingLine = new THREE.Line(
      rubbingGeometry,
      new THREE.LineBasicMaterial({
        color: 0xffae46,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        linewidth: 3,
      }),
    );
    rubbingLine.renderOrder = 6;
    deps.scene.add(rubbingLine);
    const cue: ImpactCue = {
      mesh,
      frictionArrow,
      slipArrow,
      normalArrow,
      resultantArrow,
      rubbingLine,
      age: 0,
      stage: 'pause',
      ballLabel,
      bounceIndex,
      contactSpeed: Math.hypot(event.contactVx, event.contactVz),
      before: Math.round(event.beforeTopSpinRpm),
      after: Math.round(event.afterTopSpinRpm),
    };
    cues.push(cue);
    activeCue = cue;

    if (eventEl) {
      renderEventCard(cue, 'pause');
      eventEl.classList.remove('visible', 'pulse');
      // Force the short pulse animation to restart for nearly simultaneous
      // blue/red contacts without introducing a timing dependency in physics.
      void eventEl.offsetWidth;
      eventEl.classList.add('visible', 'pulse');
      eventTimer = 3.6;
    }
  };

  const update = (deltaSeconds: number): void => {
    const dt = Math.max(0, Math.min(deltaSeconds, 1 / 24));
    for (let index = cues.length - 1; index >= 0; index -= 1) {
      const cue = cues[index];
      cue.age += dt;
      const progress = THREE.MathUtils.clamp(cue.age / CUE_LIFETIME_SECONDS, 0, 1);
      const stage = stageForAge(cue.age);
      if (stage !== cue.stage) {
        cue.stage = stage;
        if (cue === activeCue) renderEventCard(cue, stage);
      }
      const radius = THREE.MathUtils.lerp(CUE_START_RADIUS_MM, CUE_END_RADIUS_MM, progress);
      cue.mesh.scale.setScalar(radius / CUE_START_RADIUS_MM);
      const opacity = 0.96 * (1 - progress);
      cue.mesh.material.opacity = 0.9 * (1 - progress);
      const arrowFactors = stage === 'pause'
        ? { friction: 0, slip: 0, normal: 0, resultant: 0, rubbing: 0 }
        : stage === 'friction'
          ? { friction: 1, slip: 0.18, normal: 0.14, resultant: 0, rubbing: 1 }
          : stage === 'normal'
            ? { friction: 0.24, slip: 0.12, normal: 1, resultant: 0, rubbing: 0.35 }
            : { friction: 0.78, slip: 0.34, normal: 0.82, resultant: 1, rubbing: 0.72 };
      setArrowOpacity(cue.frictionArrow, opacity * arrowFactors.friction);
      setArrowOpacity(cue.slipArrow, opacity * arrowFactors.slip);
      setArrowOpacity(cue.normalArrow, opacity * arrowFactors.normal);
      setArrowOpacity(cue.resultantArrow, opacity * arrowFactors.resultant);
      cue.rubbingLine.material.opacity = opacity * arrowFactors.rubbing;
      const reveal = THREE.MathUtils.clamp((cue.age - FORCE_PAUSE_SECONDS) / 0.62, 0, 1);
      cue.rubbingLine.scale.setScalar(0.12 + 0.88 * THREE.MathUtils.smoothstep(reveal, 0, 1));
      if (progress >= 1) {
        disposeCue(cue);
        cues.splice(index, 1);
      }
    }
    if (eventTimer > 0) {
      eventTimer = Math.max(0, eventTimer - dt);
      if (eventTimer === 0) eventEl?.classList.remove('visible', 'pulse');
    }
  };

  return { addImpactCue, update, reset };
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
