//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
//#endregion

//#region 常量/配置
// The recording scene needs enough time to show both table contacts. Keep the
// camera move subordinate to the event: one gentle push-in, a short hold on
// the net/landing area, then a gentle return to the establishing view. The
// previous 8.5 s orbit changed direction while the same pair was still in
// flight, which made the recording hard to follow.
export const RECORDING_CAMERA_CYCLE_SECONDS = 20;
interface RecordingCameraKeyframe {
  time: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
}

const RECORDING_CAMERA_KEYFRAMES: readonly RecordingCameraKeyframe[] = [
  { time: 0, position: [4800, 2200, 1900], target: [1370, 620, -762.5], fov: 48 },
  { time: 5, position: [4400, 1950, 1400], target: [1420, 650, -762.5], fov: 46 },
  { time: 11, position: [3600, 1700, 850], target: [1500, 680, -762.5], fov: 44 },
  { time: 15, position: [3600, 1700, 850], target: [1500, 680, -762.5], fov: 44 },
  { time: 20, position: [4800, 2200, 1900], target: [1370, 620, -762.5], fov: 48 },
];
//#endregion

//#region 模型/类型
export interface RecordingCameraApi {
  reset: () => void;
  update: (deltaSeconds: number) => void;
}

interface RecordingCameraDeps {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}
//#endregion

//#region 私有成员
function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}
//#endregion

//#region 公开 API
/**
 * A deterministic, real Three.js camera move for external recording.
 * It cycles with the recording demo restart period so every take contains
 * an establishing shot, one readable push-in on the net/landing area, and a
 * wide return. There is no orbit or direction change during the contact.
 */
export function initRecordingCamera(deps: RecordingCameraDeps): RecordingCameraApi {
  let elapsedSeconds = 0;

  const applyPose = (position: readonly number[], target: readonly number[], fov: number): void => {
    deps.camera.position.set(position[0], position[1], position[2]);
    deps.controls.target.set(target[0], target[1], target[2]);
    deps.camera.lookAt(deps.controls.target);
    deps.camera.fov = fov;
    deps.camera.updateProjectionMatrix();
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
    const progress = smoothStep(THREE.MathUtils.clamp((time - from.time) / span, 0, 1));
    deps.camera.position.lerpVectors(
      new THREE.Vector3(...from.position),
      new THREE.Vector3(...to.position),
      progress,
    );
    deps.controls.target.lerpVectors(
      new THREE.Vector3(...from.target),
      new THREE.Vector3(...to.target),
      progress,
    );
    deps.camera.lookAt(deps.controls.target);
    deps.camera.fov = THREE.MathUtils.lerp(from.fov, to.fov, progress);
    deps.camera.updateProjectionMatrix();
  };

  deps.controls.enabled = false;
  reset();
  return { reset, update };
}
//#endregion
