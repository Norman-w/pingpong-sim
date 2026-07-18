//#region 导入/依赖
import * as THREE from 'three';
import type { TrackingSnapshot } from './trackingTypes';

//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
export interface ReplaySampleFrame {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
  stanceMm: THREE.Vector3;
  lookAtMm: THREE.Vector3;
}
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
export function sampleTrackingReplayFrame(
  recording: TrackingSnapshot[],
  time: number,
): ReplaySampleFrame {
  let right = 1;
  while (right < recording.length && recording[right].time < time) right += 1;
  const left = Math.max(0, right - 1);
  const a = recording[left];
  const b = recording[Math.min(right, recording.length - 1)];
  const span = Math.max(1e-6, b.time - a.time);
  const replayAlpha = THREE.MathUtils.clamp((time - a.time) / span, 0, 1);
  return {
    position: new THREE.Vector3().lerpVectors(a.position, b.position, replayAlpha),
    rotation: a.rotation.clone().slerp(b.rotation, replayAlpha),
    angularVelocity: new THREE.Vector3().lerpVectors(a.angularVelocity, b.angularVelocity, replayAlpha),
    stanceMm: new THREE.Vector3().lerpVectors(a.stanceMm, b.stanceMm, replayAlpha),
    lookAtMm: new THREE.Vector3().lerpVectors(a.lookAtMm, b.lookAtMm, replayAlpha),
  };
}

export function advanceTrackingReplaySpin(
  mesh: THREE.Mesh,
  angularVelocity: THREE.Vector3,
  deltaSeconds: number,
  trackingSpeed: number,
): void {
  const angularSpeed = angularVelocity.length();
  if (angularSpeed <= 1e-6) return;
  const replayRotationStep = new THREE.Quaternion().setFromAxisAngle(
    angularVelocity.clone().multiplyScalar(1 / angularSpeed),
    angularSpeed * deltaSeconds * trackingSpeed,
  );
  // Rapier angular velocity is expressed in world space, hence premultiply.
  mesh.quaternion.premultiply(replayRotationStep).normalize();
}

export function activeReplayCueIdAt(
  cues: { id: string; time: number }[],
  time: number,
): string | null {
  let active: { id: string; time: number } | null = null;
  for (const cue of cues) {
    if (cue.time <= time + 1e-3) active = cue;
  }
  return active?.id ?? null;
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
