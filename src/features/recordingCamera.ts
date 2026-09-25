//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
//#endregion

//#region 常量/配置
const CAMERA_CYCLE_SECONDS = 8.5;
interface RecordingCameraKeyframe {
  time: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
}

const RECORDING_CAMERA_KEYFRAMES: readonly RecordingCameraKeyframe[] = [
  { time: 0, position: [4300, 1750, -762.5], target: [1370, 965, -762.5], fov: 45 },
  { time: 1.9, position: [3500, 1480, -762.5], target: [1530, 930, -762.5], fov: 42 },
  { time: 3.8, position: [2050, 1580, 920], target: [1430, 940, -650], fov: 43 },
  { time: 5.8, position: [2150, 1450, -2850], target: [1430, 920, -760], fov: 44 },
  { time: 7.2, position: [4450, 2450, 2450], target: [1370, 900, -762.5], fov: 49 },
  { time: CAMERA_CYCLE_SECONDS, position: [4300, 1750, -762.5], target: [1370, 965, -762.5], fov: 45 },
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
 * an establishing shot, a push-in, an angled table view, and a wide pullback.
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
    elapsedSeconds = (elapsedSeconds + Math.max(0, deltaSeconds)) % CAMERA_CYCLE_SECONDS;
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
