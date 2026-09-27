//#region 导入/依赖
import * as THREE from 'three';
//#endregion

//#region 常量/配置
const CUE_LIFETIME_SECONDS = 0.7;
const CUE_START_RADIUS_MM = 28;
const CUE_END_RADIUS_MM = 150;
//#endregion

//#region 模型/类型
interface ImpactCue {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

export interface RecordingEffectsApi {
  addImpactCue: (xMm: number, zMm: number, color: number, bounceIndex: number) => void;
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
}): RecordingEffectsApi {
  const ringGeometry = new THREE.RingGeometry(CUE_START_RADIUS_MM, CUE_START_RADIUS_MM + 8, 32);
  const cues: ImpactCue[] = [];
  const eventEl = document.getElementById('spin-recording-event');
  let eventTimer = 0;

  const reset = (): void => {
    for (const cue of cues) {
      deps.scene.remove(cue.mesh);
      cue.mesh.material.dispose();
    }
    cues.length = 0;
    eventTimer = 0;
    eventEl?.classList.remove('visible', 'pulse');
  };

  const addImpactCue = (xMm: number, zMm: number, color: number, bounceIndex: number): void => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.position.set(xMm, deps.tableTopY + 4, zMm);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 4;
    deps.scene.add(mesh);
    cues.push({ mesh, age: 0 });

    if (eventEl) {
      eventEl.textContent = `第 ${bounceIndex} 跳 · 球擦台后转速继续变化`;
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
      cue.mesh.material.opacity = 0.9 * (1 - progress);
      if (progress >= 1) {
        deps.scene.remove(cue.mesh);
        cue.mesh.material.dispose();
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
