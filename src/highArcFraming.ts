//#region 导入/依赖
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
//#endregion

//#region 常量/配置
/** Comfortable ball height (mm) before locked views start compensating. */
const COMFORT_BALL_Y_MM = 2200;
/** Ball height (mm) at which height-based blend reaches 1. */
const FULL_BLEND_BALL_Y_MM = 4200;
/** Keep the ball inside this NDC margin (1 = frustum edge). */
const SAFE_NDC = 0.72;
const MAX_PULLBACK_MM = 1100;
const MAX_CAMERA_LIFT_MM = 520;
const MAX_FOV = 60;
const SMOOTH_RATE = 9;
const CATCHUP_RATE = 18;
//#endregion

//#region 模型/类型
export interface QuickViewBasePose {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
}

interface HighArcFramingArgs {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  ballMm: Vector3;
  deltaSeconds: number;
}
//#endregion

//#region 私有成员
let basePose: QuickViewBasePose | null = null;
let smoothedAim = 0;
let smoothedPull = 0;
let smoothedFov = 0;
const ndcScratch = new Vector3();

function desiredHeightBlend(ballYMm: number): number {
  if (ballYMm <= COMFORT_BALL_Y_MM) return 0;
  return Math.min(1, (ballYMm - COMFORT_BALL_Y_MM) / (FULL_BLEND_BALL_Y_MM - COMFORT_BALL_Y_MM));
}

function outOfFrameAmount(ndc: Vector3): number {
  // Behind camera or outside the near/far band counts as fully out.
  if (ndc.z <= 0 || ndc.z >= 1) return 1;
  const overflowX = Math.max(0, Math.abs(ndc.x) - SAFE_NDC) / Math.max(1e-3, 1 - SAFE_NDC);
  const overflowY = Math.max(0, Math.abs(ndc.y) - SAFE_NDC) / Math.max(1e-3, 1 - SAFE_NDC);
  return Math.min(1, Math.max(overflowX, overflowY));
}

function projectBallNdc(camera: PerspectiveCamera, ballMm: Vector3): Vector3 {
  return ndcScratch.copy(ballMm).project(camera);
}

function applyPose(camera: PerspectiveCamera, controls: OrbitControls, pose: QuickViewBasePose): void {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  controls.target.set(pose.target.x, pose.target.y, pose.target.z);
  if (Math.abs(camera.fov - pose.fov) > 1e-3) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
  controls.update();
}

function resetSmoothing(): void {
  smoothedAim = 0;
  smoothedPull = 0;
  smoothedFov = 0;
}

function setCameraFromBase(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  pull: number,
  aim: number,
  fovBlend: number,
  ballMm: Vector3,
): void {
  const base = basePose!;
  const dx = base.position.x - base.target.x;
  const dy = base.position.y - base.target.y;
  const dz = base.position.z - base.target.z;
  const distance = Math.hypot(dx, dy, dz) || 1;
  const pullMm = pull * MAX_PULLBACK_MM;

  camera.position.set(
    base.position.x + (dx / distance) * pullMm,
    base.position.y + (dy / distance) * pullMm + pull * MAX_CAMERA_LIFT_MM,
    base.position.z + (dz / distance) * pullMm,
  );

  controls.target.set(
    base.target.x + aim * (ballMm.x - base.target.x),
    base.target.y + aim * (ballMm.y - base.target.y),
    base.target.z + aim * (ballMm.z - base.target.z),
  );

  const nextFov = base.fov + (MAX_FOV - base.fov) * fovBlend;
  if (Math.abs(camera.fov - nextFov) > 0.05) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
  controls.update();
  camera.updateMatrixWorld(true);
}
//#endregion

//#region 公开 API
export function captureQuickViewBase(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  fov = camera.fov,
): void {
  basePose = {
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    fov,
  };
  resetSmoothing();
}

export function clearQuickViewBase(camera?: PerspectiveCamera, controls?: OrbitControls): void {
  if (basePose && camera && controls) {
    applyPose(camera, controls, basePose);
  } else if (camera && Math.abs(camera.fov - 45) > 1e-3) {
    camera.fov = 45;
    camera.updateProjectionMatrix();
  }
  basePose = null;
  resetSmoothing();
}

export function restoreQuickViewBase(camera: PerspectiveCamera, controls: OrbitControls): void {
  if (!basePose) return;
  applyPose(camera, controls, basePose);
  resetSmoothing();
}

/**
 * Keep a locked quick-view identity, but temporarily reframe so the ball stays
 * on screen. When the ball is comfortably visible from the base pose again,
 * ease camera aim / pull / FOV back to that baseline.
 */
export function updateHighArcFraming({
  camera,
  controls,
  ballMm,
  deltaSeconds,
}: HighArcFramingArgs): void {
  if (!basePose) return;

  const dt = Math.max(0, deltaSeconds);
  const smoothAlpha = 1 - Math.exp(-SMOOTH_RATE * dt);
  const catchupAlpha = 1 - Math.exp(-CATCHUP_RATE * dt);
  const heightBlend = desiredHeightBlend(ballMm.y);

  // Probe whether the base framing already contains the ball.
  applyPose(camera, controls, basePose);
  camera.updateMatrixWorld(true);
  const probeOut = outOfFrameAmount(projectBallNdc(camera, ballMm));

  // Aim at the ball when it would leave the frame; height only nudges pull/FOV.
  const wantAim = probeOut > 0 ? Math.min(1, 0.45 + probeOut * 0.55) : 0;
  const wantPull = Math.min(1, Math.max(heightBlend, probeOut * 0.85));
  const wantFov = Math.min(1, Math.max(heightBlend * 0.75, probeOut));

  // Enter framing quickly when the ball escapes; ease out more gently.
  const aimAlpha = wantAim > smoothedAim ? catchupAlpha : smoothAlpha;
  const pullAlpha = wantPull > smoothedPull ? catchupAlpha : smoothAlpha;
  const fovAlpha = wantFov > smoothedFov ? catchupAlpha : smoothAlpha;
  smoothedAim += (wantAim - smoothedAim) * aimAlpha;
  smoothedPull += (wantPull - smoothedPull) * pullAlpha;
  smoothedFov += (wantFov - smoothedFov) * fovAlpha;

  if (
    smoothedAim < 0.002 &&
    smoothedPull < 0.002 &&
    smoothedFov < 0.002 &&
    wantAim <= 0 &&
    wantPull <= 0
  ) {
    resetSmoothing();
    applyPose(camera, controls, basePose);
    return;
  }

  setCameraFromBase(camera, controls, smoothedPull, smoothedAim, smoothedFov, ballMm);

  // If still clipped after the smoothed pose, pull aim harder this frame so the
  // ball never stays off-screen for a noticeable stretch.
  let framedOut = outOfFrameAmount(projectBallNdc(camera, ballMm));
  if (framedOut > 0.05) {
    smoothedAim = Math.min(1, smoothedAim + framedOut * 0.55);
    smoothedFov = Math.min(1, smoothedFov + framedOut * 0.35);
    smoothedPull = Math.min(1, smoothedPull + framedOut * 0.25);
    setCameraFromBase(camera, controls, smoothedPull, smoothedAim, smoothedFov, ballMm);
    framedOut = outOfFrameAmount(projectBallNdc(camera, ballMm));
    // Last resort: look almost directly at the ball while keeping camera locus.
    if (framedOut > 0.12) {
      smoothedAim = 1;
      smoothedFov = 1;
      setCameraFromBase(camera, controls, smoothedPull, smoothedAim, smoothedFov, ballMm);
    }
  }
}
//#endregion
