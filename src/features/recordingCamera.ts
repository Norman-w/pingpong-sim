//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
//#endregion

//#region 常量/配置
// One deliberate move: establish the whole table, make a constant-speed push
// toward the contact area, then hold. The camera never orbits or reverses while
// the balls are in flight.
export const RECORDING_CAMERA_CYCLE_SECONDS = 12;
export type RecordingCameraPhase = 'establish' | 'approach' | 'contact' | 'hold';
interface RecordingCameraKeyframe {
  time: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
}

const RECORDING_CAMERA_KEYFRAMES: readonly RecordingCameraKeyframe[] = [
  { time: 0, position: [4000, 1800, 1400], target: [1340, 650, -762.5], fov: 46 },
  { time: 0.45, position: [4000, 1800, 1400], target: [1340, 650, -762.5], fov: 46 },
  // Finish the one constant-speed push before the first contact slow window.
  // The camera then holds this readable 3D contact view while the ball is
  // slowed at the table instead of drifting through the collision.
  { time: 1.35, position: [2850, 1450, 800], target: [1700, 700, -762.5], fov: 46 },
  { time: 12, position: [2850, 1450, 800], target: [1700, 700, -762.5], fov: 46 },
];
//#endregion

//#region 模型/类型
export interface RecordingCameraApi {
  reset: () => void;
  update: (deltaSeconds: number) => void;
  phase: () => RecordingCameraPhase;
}

interface RecordingCameraDeps {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}
//#endregion

//#region 私有成员
const fromPositionScratch = new THREE.Vector3();
const toPositionScratch = new THREE.Vector3();
const fromTargetScratch = new THREE.Vector3();
const toTargetScratch = new THREE.Vector3();

function phaseForTime(time: number): RecordingCameraPhase {
  if (time < 0.45) return 'establish';
  if (time < 1.35) return 'approach';
  if (time < 8.5) return 'contact';
  return 'hold';
}
//#endregion

//#region 公开 API
/**
 * A deterministic, real Three.js camera move for external recording.
 * It cycles with the recording demo restart period so every take contains
 * an establishing shot, one readable push-in on the net/landing area, and a
 * steady hold. There is no orbit, zoom, or direction change during contact.
 */
export function initRecordingCamera(deps: RecordingCameraDeps): RecordingCameraApi {
  let elapsedSeconds = 0;
  let appliedFov = Number.NaN;

  const applyPose = (position: readonly number[], target: readonly number[], fov: number): void => {
    deps.camera.position.set(position[0], position[1], position[2]);
    deps.controls.target.set(target[0], target[1], target[2]);
    deps.camera.lookAt(deps.controls.target);
    deps.camera.fov = fov;
    deps.camera.updateProjectionMatrix();
    appliedFov = fov;
  };

  const reset = (): void => {
    elapsedSeconds = 0;
    const first = RECORDING_CAMERA_KEYFRAMES[0];
    applyPose(first.position, first.target, first.fov);
  };

  const update = (deltaSeconds: number): void => {
    elapsedSeconds = (elapsedSeconds + Math.max(0, deltaSeconds)) % RECORDING_CAMERA_CYCLE_SECONDS;
    const time = elapsedSeconds;
    let from = RECORDING_CAMERA_KEYFRAMES[0];
    let to = RECORDING_CAMERA_KEYFRAMES[1];
    for (let index = 1; index < RECORDING_CAMERA_KEYFRAMES.length; index += 1) {
      if (time <= RECORDING_CAMERA_KEYFRAMES[index].time) {
        from = RECORDING_CAMERA_KEYFRAMES[index - 1];
        to = RECORDING_CAMERA_KEYFRAMES[index];
        break;
      }
    }
    const span = Math.max(0.001, to.time - from.time);
    const progress = THREE.MathUtils.clamp((time - from.time) / span, 0, 1);
    fromPositionScratch.fromArray(from.position);
    toPositionScratch.fromArray(to.position);
    fromTargetScratch.fromArray(from.target);
    toTargetScratch.fromArray(to.target);
    deps.camera.position.lerpVectors(fromPositionScratch, toPositionScratch, progress);
    deps.controls.target.lerpVectors(fromTargetScratch, toTargetScratch, progress);
    deps.camera.lookAt(deps.controls.target);
    const fov = THREE.MathUtils.lerp(from.fov, to.fov, progress);
    if (fov !== appliedFov) {
      deps.camera.fov = fov;
      deps.camera.updateProjectionMatrix();
      appliedFov = fov;
    }
  };

  deps.controls.enabled = false;
  reset();
  return { reset, update, phase: () => phaseForTime(elapsedSeconds) };
}
//#endregion
