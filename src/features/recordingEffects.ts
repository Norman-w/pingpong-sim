//#region 导入/依赖
import * as THREE from 'three';
import type { TableImpactEvent } from '../domain/tableImpact';
//#endregion

//#region 常量/配置
// Each contact has its own complete explanation window. The force stages are
// deliberately serial: one arrow is visible at a time so the spoken label
// and the highlighted vector always refer to the same force.
const CUE_LIFETIME_SECONDS = 6.4;
const CUE_START_RADIUS_MM = 28;
const CUE_END_RADIUS_MM = 175;
const FRICTION_ARROW_LENGTH_MM = 190;
const SLIP_ARROW_LENGTH_MM = 150;
const NORMAL_ARROW_LENGTH_MM = 155;
const RESULTANT_ARROW_LENGTH_MM = 205;
const FORCE_PAUSE_SECONDS = 0.90;
const FRICTION_FOCUS_END_SECONDS = 2.15;
const SLIP_FOCUS_END_SECONDS = 3.35;
const NORMAL_FOCUS_END_SECONDS = 4.75;
const ARROW_REVEAL_SECONDS = 0.24;
const ARROW_SHAFT_OPACITY = 0.30;
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
  isFocus: boolean;
  contactSpeed: number;
  slipDirection: string;
  frictionDirection: string;
  resultantDirection: string;
  before: number;
  after: number;
}

type ForceStage = 'pause' | 'friction' | 'slip' | 'normal' | 'resultant';

export interface ImpactArrowDirections {
  slip: THREE.Vector3;
  friction: THREE.Vector3;
  normal: THREE.Vector3;
  resultant: THREE.Vector3;
}

/**
 * Derive the four displayed directions from the same contact quantities as
 * the table-impact resolver.  This is kept pure so the sign convention can
 * be regression-tested without constructing a Three.js scene.
 */
export function impactArrowDirections(event: TableImpactEvent): ImpactArrowDirections {
  const slip = new THREE.Vector3(event.contactVx, 0, event.contactVz);
  if (slip.lengthSq() < 1e-10) slip.set(1, 0, 0);
  slip.normalize();
  const friction = slip.clone().negate();
  const normal = new THREE.Vector3(0, 1, 0);
  const resultant = new THREE.Vector3(
    friction.x * event.tangentialImpulse,
    event.normalImpulse,
    friction.z * event.tangentialImpulse,
  );
  if (resultant.lengthSq() < 1e-12) resultant.copy(normal);
  resultant.normalize();
  return { slip, friction, normal, resultant };
}

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

  const vectorSign = (value: number, axis: string): string => {
    if (Math.abs(value) < 1e-6) return '0';
    return `${value > 0 ? '+' : '−'}${axis}`;
  };

  const planarDirection = (x: number, z: number): string =>
    `(${vectorSign(x, 'x')}, ${vectorSign(z, 'z')})`;

  const spatialDirection = (vector: THREE.Vector3): string =>
    `(${vectorSign(vector.x, 'x')}, ${vectorSign(vector.y, 'y')}, ${vectorSign(vector.z, 'z')})`;

  const stageProgress = (age: number, start: number, end: number): number =>
    THREE.MathUtils.clamp((age - start) / Math.max(0.001, end - start), 0, 1);

  const stageFactor = (age: number, start: number, end: number): number => {
    const progress = stageProgress(age, start, end);
    const fadeIn = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp((age - start) / ARROW_REVEAL_SECONDS, 0, 1),
      0,
      1,
    );
    const fadeOut = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp((end - age) / ARROW_REVEAL_SECONDS, 0, 1),
      0,
      1,
    );
    return progress > 0 && progress < 1 ? fadeIn * fadeOut : 0;
  };

  const moveArrowHead = (arrow: THREE.ArrowHelper, length: number, progress: number): void => {
    // ArrowHelper's cone is oriented along its local +Y axis. Moving that
    // cone in local space keeps the shaft fixed while the arrowhead itself
    // travels from the contact point toward the actual world-space vector.
    const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1);
    arrow.cone.position.y = length * (0.08 + 0.86 * easedProgress);
    arrow.cone.updateMatrix();
  };

  const setMaterialOpacity = (material: THREE.Material | THREE.Material[], opacity: number): void => {
    const materials = Array.isArray(material) ? material : [material];
    for (const item of materials) {
      item.transparent = true;
      item.opacity = opacity;
      item.depthWrite = false;
      item.depthTest = false;
      item.needsUpdate = true;
    }
  };

  const setArrowOpacity = (
    arrow: THREE.ArrowHelper,
    shaftFactor: number,
    headFactor: number,
  ): void => {
    // The shaft is a quiet fixed guide. Only the cone/head travels along it;
    // fading the two parts independently prevents the whole arrow looking as
    // if it flew in from outside the contact point.
    setMaterialOpacity(arrow.line.material, shaftFactor);
    setMaterialOpacity(arrow.cone.material, headFactor);
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

  const setActiveCue = (): void => {
    activeCue = [...cues].reverse().find((cue) => cue.isFocus) ?? [...cues].reverse()[0] ?? null;
  };

  const stageForAge = (age: number): ForceStage => {
    if (age < FORCE_PAUSE_SECONDS) return 'pause';
    if (age < FRICTION_FOCUS_END_SECONDS) return 'friction';
    if (age < SLIP_FOCUS_END_SECONDS) return 'slip';
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
        `<span class="force-pause">先停在蹭台这一刻，接下来一次只看一个力</span><br>` +
        `<span class="force-metrics">${metrics}</span>`;
    } else if (stage === 'friction') {
      eventEl.innerHTML = `<strong>${title} · 橙色箭头：台面对球的摩擦</strong><br>` +
        line('force-on-ball', `只看橙箭头：切向摩擦方向 ${cue.frictionDirection}`, true) + '<br>' +
        `<span class="force-metrics">${metrics}</span>`;
    } else if (stage === 'slip') {
      eventEl.innerHTML = `<strong>${title} · 绿色箭头：球对台面的反作用</strong><br>` +
        line('force-on-table', `只看绿箭头：接触点滑动方向 ${cue.slipDirection}`, true) + '<br>' +
        `<span class="force-metrics">${metrics}</span>`;
    } else if (stage === 'normal') {
      eventEl.innerHTML = `<strong>${title} · 黄色箭头：台面的法向冲量</strong><br>` +
        line('force-normal', '只看黄箭头：台面向上托球，方向 +y', true) + '<br>' +
        `<span class="force-metrics">${metrics}</span>`;
    } else {
      eventEl.innerHTML = `<strong>${title} · 紫色箭头：合力方向</strong><br>` +
        line('force-resultant', `只看紫箭头：橙色摩擦＋黄色法向 ${cue.resultantDirection}`, true) + '<br>' +
        `<span class="force-metrics">${metrics}</span>`;
    }
    eventEl.classList.remove('force-stage-pause', 'force-stage-friction', 'force-stage-slip', 'force-stage-normal', 'force-stage-resultant');
    eventEl.classList.add(`force-stage-${stage}`);
  };

  const reset = (): void => {
    for (const cue of cues) disposeCue(cue);
    cues.length = 0;
    activeCue = null;
    eventTimer = 0;
    if (eventEl) {
      eventEl.classList.remove('visible', 'pulse');
      eventEl.classList.remove('force-stage-pause', 'force-stage-friction', 'force-stage-slip', 'force-stage-normal', 'force-stage-resultant');
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
    const { slip, friction, resultant: resultantVector } = impactArrowDirections(event);
    const contact = new THREE.Vector3(xMm, deps.tableTopY + 8, zMm);
    const isFocus = ballLabel === deps.focusBallLabel;

    // The next named contact gets a clean explanation window. Keeping an old
    // focus cue underneath a new one makes the two sets of arrows look like a
    // direction change, even though each set belongs to a different bounce.
    if (isFocus) {
      for (let index = cues.length - 1; index >= 0; index -= 1) {
        if (!cues[index].isFocus) continue;
        disposeCue(cues[index]);
        cues.splice(index, 1);
      }
    }

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
      contact.clone().add(new THREE.Vector3(0, 6, 0)),
      FRICTION_ARROW_LENGTH_MM,
      0xffae46,
      34,
      18,
    );
    const slipArrow = new THREE.ArrowHelper(
      slip,
      contact.clone().add(new THREE.Vector3(0, 13, 0)),
      SLIP_ARROW_LENGTH_MM,
      0x5ee6a8,
      30,
      16,
    );
    const normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      contact.clone().add(new THREE.Vector3(0, 4, 0)),
      NORMAL_ARROW_LENGTH_MM,
      0xffe27a,
      36,
      19,
    );
    const resultantArrow = new THREE.ArrowHelper(
      resultantVector,
      contact.clone().add(new THREE.Vector3(0, 22, 0)),
      RESULTANT_ARROW_LENGTH_MM,
      0xff7bf3,
      40,
      22,
    );
    for (const arrow of [frictionArrow, slipArrow, normalArrow, resultantArrow]) {
      arrow.renderOrder = 5;
      setArrowOpacity(arrow, 0, 0);
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
      isFocus,
      contactSpeed: Math.hypot(event.contactVx, event.contactVz),
      slipDirection: planarDirection(event.contactVx, event.contactVz),
      frictionDirection: planarDirection(-event.contactVx, -event.contactVz),
      resultantDirection: spatialDirection(resultantVector),
      before: Math.round(event.beforeTopSpinRpm),
      after: Math.round(event.afterTopSpinRpm),
    };
    cues.push(cue);
    setActiveCue();

    if (eventEl && activeCue === cue) {
      renderEventCard(cue, 'pause');
      eventEl.classList.remove('visible', 'pulse');
      // Force the short pulse animation to restart for nearly simultaneous
      // blue/red contacts without introducing a timing dependency in physics.
      void eventEl.offsetWidth;
      eventEl.classList.add('visible', 'pulse');
      eventTimer = CUE_LIFETIME_SECONDS + 0.35;
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
      const focusFactor = cue.isFocus ? 1 : 0.28;
      // The non-focus ball keeps a quiet contact ring, but it must not add a
      // second force arrow while the narration is explaining the focus ball.
      const arrowFocusFactor = cue.isFocus ? 1 : 0;
      cue.mesh.material.opacity = 0.9 * (1 - progress) * focusFactor;
      const frictionProgress = stageProgress(cue.age, FORCE_PAUSE_SECONDS, FRICTION_FOCUS_END_SECONDS);
      const slipProgress = stageProgress(cue.age, FRICTION_FOCUS_END_SECONDS, SLIP_FOCUS_END_SECONDS);
      const normalProgress = stageProgress(cue.age, SLIP_FOCUS_END_SECONDS, NORMAL_FOCUS_END_SECONDS);
      const resultantProgress = stageProgress(cue.age, NORMAL_FOCUS_END_SECONDS, CUE_LIFETIME_SECONDS);
      const updateArrow = (arrow: THREE.ArrowHelper, length: number, progress: number, factor: number): void => {
        // Only the current stage owns an arrow. The shaft is a fixed, quiet
        // guide and the cone travels along it; no whole arrow enters from
        // outside the contact point.
        moveArrowHead(arrow, length, progress);
        const visible = factor > 0;
        const shaftOpacity = visible ? opacity * arrowFocusFactor * ARROW_SHAFT_OPACITY * factor : 0;
        const headOpacity = visible ? opacity * arrowFocusFactor * factor : 0;
        setArrowOpacity(arrow, shaftOpacity, headOpacity);
      };
      updateArrow(
        cue.frictionArrow,
        FRICTION_ARROW_LENGTH_MM,
        frictionProgress,
        stageFactor(cue.age, FORCE_PAUSE_SECONDS, FRICTION_FOCUS_END_SECONDS),
      );
      updateArrow(
        cue.slipArrow,
        SLIP_ARROW_LENGTH_MM,
        slipProgress,
        stageFactor(cue.age, FRICTION_FOCUS_END_SECONDS, SLIP_FOCUS_END_SECONDS),
      );
      updateArrow(
        cue.normalArrow,
        NORMAL_ARROW_LENGTH_MM,
        normalProgress,
        stageFactor(cue.age, SLIP_FOCUS_END_SECONDS, NORMAL_FOCUS_END_SECONDS),
      );
      updateArrow(
        cue.resultantArrow,
        RESULTANT_ARROW_LENGTH_MM,
        resultantProgress,
        stageFactor(cue.age, NORMAL_FOCUS_END_SECONDS, CUE_LIFETIME_SECONDS),
      );
      const rubbingFactor = stageFactor(cue.age, FORCE_PAUSE_SECONDS, SLIP_FOCUS_END_SECONDS);
      cue.rubbingLine.material.opacity = opacity * rubbingFactor * arrowFocusFactor;
      cue.rubbingLine.scale.setScalar(0.12 + 0.88 * THREE.MathUtils.smoothstep(
        THREE.MathUtils.clamp((cue.age - FORCE_PAUSE_SECONDS) / 0.48, 0, 1),
        0,
        1,
      ));
      if (progress >= 1) {
        disposeCue(cue);
        cues.splice(index, 1);
        if (activeCue === null) setActiveCue();
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
