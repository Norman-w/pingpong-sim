//#region 导入/依赖
import * as THREE from 'three';
import type { TableImpactEvent } from '../domain/tableImpact';
//#endregion

//#region 常量/配置
const CUE_LIFETIME_SECONDS = 1.05;
const CUE_START_RADIUS_MM = 28;
const CUE_END_RADIUS_MM = 175;
const FRICTION_ARROW_LENGTH_MM = 190;
const SLIP_ARROW_LENGTH_MM = 150;
const NORMAL_ARROW_LENGTH_MM = 155;
//#endregion

//#region 模型/类型
interface ImpactCue {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  frictionArrow: THREE.ArrowHelper;
  slipArrow: THREE.ArrowHelper;
  normalArrow: THREE.ArrowHelper;
  rubbingLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  age: number;
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
  };

  const reset = (): void => {
    for (const cue of cues) disposeCue(cue);
    cues.length = 0;
    eventTimer = 0;
    if (eventEl) {
      eventEl.classList.remove('visible', 'pulse');
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
    for (const arrow of [frictionArrow, slipArrow, normalArrow]) {
      arrow.renderOrder = 5;
      setArrowOpacity(arrow, 0.96);
      deps.scene.add(arrow);
    }

    const rubbingGeometry = new THREE.BufferGeometry().setFromPoints([
      contact.clone().add(slip.clone().multiplyScalar(-125)).setY(deps.tableTopY + 5),
      contact.clone().add(slip.clone().multiplyScalar(125)).setY(deps.tableTopY + 5),
    ]);
    const rubbingLine = new THREE.Line(
      rubbingGeometry,
      new THREE.LineBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: false,
        linewidth: 3,
      }),
    );
    rubbingLine.renderOrder = 6;
    deps.scene.add(rubbingLine);
    cues.push({ mesh, frictionArrow, slipArrow, normalArrow, rubbingLine, age: 0 });

    if (eventEl) {
      const contactSpeed = Math.hypot(event.contactVx, event.contactVz);
      const before = Math.round(event.beforeTopSpinRpm);
      const after = Math.round(event.afterTopSpinRpm);
      eventEl.innerHTML = `<strong>重点看${deps.focusBallLabel}路线 · ${ballLabel}第 ${bounceIndex} 跳 · 接触瞬间</strong><br>` +
        `<span class="force-on-ball">橙箭头：台面对球的切向摩擦，抵抗接触点滑动</span><br>` +
        `<span class="force-on-table">绿箭头：球对台面的擦动，方向与橙箭头相反</span><br>` +
        `<span class="force-normal">黄箭头：台面对球的法向冲量 ↑ · |v∥| ${contactSpeed.toFixed(2)} m/s · ${before} → ${after} rpm</span>`;
      eventEl.classList.remove('visible', 'pulse');
      // Force the short pulse animation to restart for nearly simultaneous
      // blue/red contacts without introducing a timing dependency in physics.
      void eventEl.offsetWidth;
      eventEl.classList.add('visible', 'pulse');
      eventTimer = 1.15;
    }
  };

  const update = (deltaSeconds: number): void => {
    const dt = Math.max(0, Math.min(deltaSeconds, 1 / 24));
    for (let index = cues.length - 1; index >= 0; index -= 1) {
      const cue = cues[index];
      cue.age += dt;
      const progress = THREE.MathUtils.clamp(cue.age / CUE_LIFETIME_SECONDS, 0, 1);
      const radius = THREE.MathUtils.lerp(CUE_START_RADIUS_MM, CUE_END_RADIUS_MM, progress);
      cue.mesh.scale.setScalar(radius / CUE_START_RADIUS_MM);
      const opacity = 0.96 * (1 - progress);
      cue.mesh.material.opacity = 0.9 * (1 - progress);
      setArrowOpacity(cue.frictionArrow, opacity);
      setArrowOpacity(cue.slipArrow, opacity);
      setArrowOpacity(cue.normalArrow, opacity);
      cue.rubbingLine.material.opacity = opacity;
      cue.rubbingLine.scale.setScalar(THREE.MathUtils.smoothstep(progress, 0, 0.7));
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
