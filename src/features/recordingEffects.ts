//#region 导入/依赖
import * as THREE from 'three';
import type { TableImpactEvent } from '../domain/tableImpact';
//#endregion

//#region 常量/配置
// Each contact has its own complete explanation window.  A cue remains long
// enough to show the fixed contact point, the tangential pair, the normal
// impulse, and finally their resultant before the next contact takes focus.
const CUE_LIFETIME_SECONDS = 5.8;
const CUE_START_RADIUS_MM = 28;
const CUE_END_RADIUS_MM = 175;
const FRICTION_ARROW_LENGTH_MM = 190;
const SLIP_ARROW_LENGTH_MM = 150;
const NORMAL_ARROW_LENGTH_MM = 155;
const RESULTANT_ARROW_LENGTH_MM = 205;
const FORCE_PAUSE_SECONDS = 0.90;
const FRICTION_FOCUS_END_SECONDS = 2.50;
const NORMAL_FOCUS_END_SECONDS = 4.20;
const ARROW_FLOW_PERIOD_SECONDS = 1.55;
const ARROW_SHAFT_BASE_OPACITY = 0.22;
const ARROW_SHAFT_ACTIVE_OPACITY = 0.30;
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

type ForceStage = 'pause' | 'friction' | 'normal' | 'resultant';

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

  const arrowFlowPhase = (age: number, stageStart: number): number => {
    const phase = (Math.max(0, age - stageStart) / ARROW_FLOW_PERIOD_SECONDS) % 1;
    return phase < 0 ? phase + 1 : phase;
  };

  const moveArrowHead = (arrow: THREE.ArrowHelper, length: number, phase: number): void => {
    // ArrowHelper's cone is oriented along its local +Y axis. Moving that
    // cone in local space keeps the shaft fixed while the arrowhead visibly
    // travels in the actual world-space direction of the vector.
    const easedPhase = THREE.MathUtils.smoothstep(phase, 0, 1);
    arrow.cone.position.y = length * (0.10 + 0.88 * easedPhase);
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
        `<span class="force-pause">先停在蹭台这一刻，接下来逐个看箭头</span><br>` +
        `<span class="force-metrics">${metrics}</span>`;
    } else if (stage === 'friction') {
      eventEl.innerHTML = `<strong>${title} · 先看切向摩擦</strong><br>` +
        line('force-on-ball', `橙：台面给球的摩擦，方向 ${cue.frictionDirection}`, true) + '<br>' +
        line('force-on-table', `绿：球擦台面的方向 ${cue.slipDirection}，与橙箭头相反`, false) + '<br>' +
        `<span class="force-metrics">${metrics}</span>`;
    } else if (stage === 'normal') {
      eventEl.innerHTML = `<strong>${title} · 再看法向冲量</strong><br>` +
        line('force-normal', '黄：台面向上托球，方向 +y', true) + '<br>' +
        line('force-on-ball', '橙：切向摩擦，正在改变接触点速度', false) + '<br>' +
        `<span class="force-metrics">${metrics}</span>`;
    } else {
      eventEl.innerHTML = `<strong>${title} · 看合力方向</strong><br>` +
        line('force-resultant', `紫：橙＋黄的合成方向 ${cue.resultantDirection}`, true) + '<br>' +
        line('force-on-ball', '橙：台面对球的切向摩擦', false) + '<br>' +
        line('force-normal', '黄：台面向上的法向冲量', false) + '<br>' +
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
      cue.mesh.material.opacity = 0.9 * (1 - progress) * focusFactor;
      const arrowFactors = stage === 'pause'
        ? { friction: 0, slip: 0, normal: 0, resultant: 0, rubbing: 0 }
        : stage === 'friction'
          ? { friction: 1, slip: 0.52, normal: 0.12, resultant: 0, rubbing: 1 }
          : stage === 'normal'
            ? { friction: 0.26, slip: 0.22, normal: 1, resultant: 0, rubbing: 0.35 }
            : { friction: 0.78, slip: 0.42, normal: 0.82, resultant: 1, rubbing: 0.72 };
      moveArrowHead(cue.frictionArrow, FRICTION_ARROW_LENGTH_MM, arrowFlowPhase(cue.age, FORCE_PAUSE_SECONDS));
      moveArrowHead(cue.slipArrow, SLIP_ARROW_LENGTH_MM, arrowFlowPhase(cue.age, FORCE_PAUSE_SECONDS));
      moveArrowHead(cue.normalArrow, NORMAL_ARROW_LENGTH_MM, arrowFlowPhase(cue.age, FRICTION_FOCUS_END_SECONDS));
      moveArrowHead(cue.resultantArrow, RESULTANT_ARROW_LENGTH_MM, arrowFlowPhase(cue.age, NORMAL_FOCUS_END_SECONDS));
      const updateArrow = (arrow: THREE.ArrowHelper, factor: number): void => {
        const visible = factor > 0;
        const shaftOpacity = visible
          ? opacity * focusFactor * (ARROW_SHAFT_BASE_OPACITY + ARROW_SHAFT_ACTIVE_OPACITY * factor)
          : 0;
        const headOpacity = visible ? opacity * focusFactor * factor : 0;
        setArrowOpacity(arrow, shaftOpacity, headOpacity);
      };
      updateArrow(cue.frictionArrow, arrowFactors.friction);
      updateArrow(cue.slipArrow, arrowFactors.slip);
      updateArrow(cue.normalArrow, arrowFactors.normal);
      updateArrow(cue.resultantArrow, arrowFactors.resultant);
      cue.rubbingLine.material.opacity = opacity * arrowFactors.rubbing * focusFactor;
      const reveal = THREE.MathUtils.clamp((cue.age - FORCE_PAUSE_SECONDS) / 0.62, 0, 1);
      cue.rubbingLine.scale.setScalar(0.12 + 0.88 * THREE.MathUtils.smoothstep(reveal, 0, 1));
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
