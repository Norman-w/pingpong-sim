//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
//#endregion

//#region 常量/配置
// One deliberate move: establish the whole table, make a constant-speed push
// toward the contact area, then hold. The camera never orbits or reverses while
// the balls are in flight.
export const RECORDING_CAMERA_CYCLE_SECONDS = 12;
export type RecordingCameraShot = 'overview' | 'contact' | 'force';
export type RecordingCameraPhase = 'establish' | 'approach' | 'contact' | 'hold';
interface RecordingCameraKeyframe {
  time: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
}

const OVERVIEW_CAMERA_KEYFRAMES: readonly RecordingCameraKeyframe[] = [
  { time: 0, position: [4000, 1800, 1400], target: [1340, 650, -762.5], fov: 46 },
  { time: 0.45, position: [4000, 1800, 1400], target: [1340, 650, -762.5], fov: 46 },
  // Finish the one constant-speed push before the first contact slow window.
  // The camera then holds this readable 3D contact view while the ball is
  // slowed at the table instead of drifting through the collision.
  { time: 1.35, position: [2850, 1450, 800], target: [1700, 700, -762.5], fov: 46 },
  { time: 12, position: [2850, 1450, 800], target: [1700, 700, -762.5], fov: 46 },
];

// Detail takes keep one calm dolly, then hold a close three-dimensional view.
// The focus point is supplied by the measured impact event in main.ts, so the
// camera can move to the actual contact instead of an invented screen point.
const CONTACT_CAMERA_KEYFRAMES: readonly RecordingCameraKeyframe[] = [
  { time: 0, position: [3900, 1750, 1250], target: [1320, 650, -762.5], fov: 48 },
  { time: 0.55, position: [3900, 1750, 1250], target: [1320, 650, -762.5], fov: 48 },
  { time: 1.8, position: [2350, 1120, 460], target: [1150, 760, -762.5], fov: 42 },
  { time: 12, position: [2350, 1120, 460], target: [1150, 760, -762.5], fov: 42 },
];

const FORCE_CAMERA_KEYFRAMES: readonly RecordingCameraKeyframe[] = [
  { time: 0, position: [3600, 1500, 1050], target: [1320, 650, -762.5], fov: 48 },
  { time: 0.55, position: [3600, 1500, 1050], target: [1320, 650, -762.5], fov: 48 },
  { time: 1.9, position: [1850, 980, 260], target: [1050, 760, -762.5], fov: 38 },
  { time: 12, position: [1850, 980, 260], target: [1050, 760, -762.5], fov: 38 },
];

function keyframesForShot(shot: RecordingCameraShot): readonly RecordingCameraKeyframe[] {
  if (shot === 'contact') return CONTACT_CAMERA_KEYFRAMES;
  if (shot === 'force') return FORCE_CAMERA_KEYFRAMES;
  return OVERVIEW_CAMERA_KEYFRAMES;
}

function focusAnchorForShot(shot: RecordingCameraShot): THREE.Vector3 | null {
  if (shot === 'contact') return new THREE.Vector3(1150, 760, -762.5);
  if (shot === 'force') return new THREE.Vector3(1050, 760, -762.5);
  return null;
}
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
  shot?: RecordingCameraShot;
  getFocusPoint?: () => THREE.Vector3 | null;
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
  const shot = deps.shot ?? 'overview';
  const keyframes = keyframesForShot(shot);
  const focusAnchor = focusAnchorForShot(shot);
  let elapsedSeconds = 0;
  let appliedFov = Number.NaN;
  const smoothFocus = new THREE.Vector3();
  let hasSmoothFocus = false;

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
    hasSmoothFocus = false;
    const first = keyframes[0];
    applyPose(first.position, first.target, first.fov);
  };

  const update = (deltaSeconds: number): void => {
    elapsedSeconds = (elapsedSeconds + Math.max(0, deltaSeconds)) % RECORDING_CAMERA_CYCLE_SECONDS;
    const time = elapsedSeconds;
    let from = keyframes[0];
    let to = keyframes[1];
    for (let index = 1; index < keyframes.length; index += 1) {
      if (time <= keyframes[index].time) {
        from = keyframes[index - 1];
        to = keyframes[index];
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

    // Detail shots are still real camera moves. Once a measured contact is
    // available, shift the held pose toward that contact with a short smooth
    // blend. The overview take deliberately keeps the whole table visible.
    const rawFocus = shot === 'overview' ? null : deps.getFocusPoint?.() ?? null;
    if (rawFocus && focusAnchor) {
      if (!hasSmoothFocus) {
        smoothFocus.copy(rawFocus);
        hasSmoothFocus = true;
      } else {
        smoothFocus.lerp(rawFocus, THREE.MathUtils.clamp(deltaSeconds * 7, 0, 1));
      }
      const focusDelta = smoothFocus.clone().sub(focusAnchor);
      deps.camera.position.add(focusDelta);
      deps.controls.target.add(focusDelta);
      deps.camera.lookAt(deps.controls.target);
    }
  };

  deps.controls.enabled = false;
  reset();
  return { reset, update, phase: () => phaseForTime(elapsedSeconds) };
}
//#endregion
