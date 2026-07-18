//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RapierBall } from '../physics';
import { buildReplayCuePoints, listReplayCueRecipe, type ReplayCuePoint } from '../replayCuePoints';
import { restoreQuickViewBase, updateHighArcFraming } from '../highArcFraming';
import { initSpinBillboard, type SpinBillboardApi } from './spinBillboard';
import type { TrackingSnapshot } from './trackingTypes';
import type { QuickViewId, ReceiveStanceApi } from './receiveStance';
import type { MachineUiApi } from './machineUi';
import {
  beginNextContinuousDemoCycle, clearDemoPlaybackPlan, consumeLiveDemoPass,
  configureFollowOnlyDemoPlayback as applyFollowOnlyDemoPlayback,
  isContinuousFollowDemo, selectFollowViewOnly, setReplaySpeedUi, takeSlowFollowPlaylist,
  type FollowOnlyDemoPlayback,
} from './trackingDemoPlayback';
import { advanceTrackingReplaySpin, sampleTrackingReplayFrame } from './trackingReplaySampling';
import { snapRecordingLaunchToOrigin } from './trackingReplayLaunchView';
import {
  applyTrackingReplayView as applyReplayView,
  highlightReplayCueButtons as highlightCues,
  seekTrackingReplayCue as seekCue,
  syncReplayCueHighlightForTime as syncCueHighlight,
  updateReplayControlButtons as updateControlButtons,
  type ReplayControlsCtx,
} from './trackingReplayControls';
//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
export type { FollowOnlyDemoPlayback };
export interface TrackingReplayDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  bGeo: THREE.BufferGeometry;
  ballMaterial: THREE.Material;
  receiveStance: ReceiveStanceApi;
  machineUiApi: MachineUiApi;
  syncWindowIndicators: () => void;
  onAutoReplayEnabled: () => void;
  onAutoReplayDisabled: () => void;
  onReplayStateChanged: () => void;
  onContinuousFollowDemoCycle?: () => void;
}

export interface TrackingReplayApi {
  beginRecording: (ball: RapierBall, now: number) => void;
  recordFrame: (now: number, ball: RapierBall) => void;
  finalizeRecording: () => void;
  isRecordingFinalized: () => boolean;
  advanceRecordingClockBy: (pausedMs: number) => void;
  startReplay: (sourceBall?: RapierBall | null) => void;
  stopReplay: () => void;
  updateReplay: (deltaSeconds: number) => void;
  refreshCuePointsUi: () => void;
  enableAutoReplayForDemo: () => void;
  configureFollowOnlyDemoPlayback: (plan: FollowOnlyDemoPlayback) => void;
  clearDemoPlaybackPlan: () => void;
  beginNextContinuousDemoCycle: () => void;
  consumeLiveDemoPass: () => 'continue-live' | 'start-replay' | 'none';
  isAutoReplayEnabled: () => boolean;
  syncAutoReplayFromCheckbox: () => void;
  isReplayMode: () => boolean;
  getReplayMesh: () => THREE.Object3D;
  syncSpinBillboardPosition: () => void;
}
//#endregion

//#region 私有成员
let deps!: TrackingReplayDeps;

let trackingReplayEl!: HTMLInputElement;
let trackingReplayPauseEl!: HTMLButtonElement;
let trackingReplayRestartEl!: HTMLButtonElement;
let replayCueGridEl!: HTMLElement;
let trackingSpeedEl!: HTMLInputElement;
let trackingSpeedValueEl!: HTMLElement;
let trackingSpeed = 1;

let trackingRecording: TrackingSnapshot[] = [];
let trackingRecordingBounceTimes: number[] = [];
let trackingRecordingImpactCount = 0;
let trackingRecordingStartedAt = 0;
let trackingRecordingFinalized = false;

let trackingAutoReplay = false;
let trackingReplayMode = false;
let trackingReplayPaused = false;
let trackingReplayExhausted = false;
let trackingReplayTime = 0;
let trackingReplaySourceBall: RapierBall | null = null;
let trackingReplayViews: QuickViewId[] = [];
let trackingReplayViewIndex = 0;
/** Skip the same-frame delta after startReplay so t=0 is actually shown. */
let trackingReplaySkipNextDelta = false;
let trackingReplayLaunchOrigin = new THREE.Vector3();
let trackingReplayCuePoints: ReplayCuePoint[] = [];
let trackingReplayActiveCueId: ReplayCuePoint['id'] | null = null;
let trackingReplayMesh!: THREE.Mesh;
let spinBillboard!: SpinBillboardApi;

const controlsCtx = (): ReplayControlsCtx => ({
  camera: deps.camera, controls: deps.controls, receiveStance: deps.receiveStance,
  trackingReplayMesh, spinBillboard, replayCueGridEl, trackingReplayPauseEl, trackingReplayRestartEl,
  getViews: () => trackingReplayViews, getViewIndex: () => trackingReplayViewIndex,
  getRecording: () => trackingRecording, getCuePoints: () => trackingReplayCuePoints,
  getActiveCueId: () => trackingReplayActiveCueId, setActiveCueId: id => { trackingReplayActiveCueId = id; },
  getReplayTime: () => trackingReplayTime, setReplayTime: time => { trackingReplayTime = time; },
  isReplayMode: () => trackingReplayMode, isPaused: () => trackingReplayPaused,
  isExhausted: () => trackingReplayExhausted, setPaused: p => { trackingReplayPaused = p; },
  setExhausted: e => { trackingReplayExhausted = e; }, getSpeed: () => trackingSpeed, replayViewLabel,
});

function selectedReplayViews(): QuickViewId[] {
  const selected = Array.from(document.querySelectorAll<HTMLInputElement>('[data-replay-view]:checked'))
    .map(input => input.dataset.replayView as QuickViewId);
  return selected.length > 0 ? selected : ['follow'];
}

function setReplaySpeed(speed: number): void {
  trackingSpeed = setReplaySpeedUi(speed, trackingSpeedEl, trackingSpeedValueEl);
}

function replayViewLabel(view: QuickViewId): string {
  return view === 'follow' ? '跟球视角' : deps.receiveStance.quickViews[view].label;
}
//#endregion

//#region 公开 API
export function initTrackingReplay(trackingReplayDeps: TrackingReplayDeps): TrackingReplayApi {
  deps = trackingReplayDeps;

  trackingReplayEl = document.getElementById('tracking-replay') as HTMLInputElement;
  trackingReplayPauseEl = document.getElementById('tracking-replay-pause') as HTMLButtonElement;
  trackingReplayRestartEl = document.getElementById('tracking-replay-restart') as HTMLButtonElement;
  replayCueGridEl = document.getElementById('replay-cue-grid')!;
  trackingSpeedEl = document.getElementById('tracking-speed') as HTMLInputElement;
  trackingSpeedValueEl = document.getElementById('tracking-speed-value')!;
  trackingSpeed = Number(trackingSpeedEl.value);

  trackingReplayMesh = new THREE.Mesh(deps.bGeo, deps.ballMaterial);
  trackingReplayMesh.visible = false;
  deps.scene.add(trackingReplayMesh);

  spinBillboard = initSpinBillboard(deps.scene);

  trackingReplayEl.addEventListener('change', () => {
    trackingAutoReplay = trackingReplayEl.checked;
    if (trackingAutoReplay) {
      deps.onAutoReplayEnabled();
    } else if (trackingReplayMode) {
      stopReplay();
      deps.onAutoReplayDisabled();
    }
    deps.onReplayStateChanged();
  });
  trackingSpeedEl.addEventListener('input', () => {
    trackingSpeed = Number(trackingSpeedEl.value);
    trackingSpeedValueEl.textContent = `${trackingSpeed.toFixed(2)}×`;
  });
  trackingReplayPauseEl.addEventListener('click', () => {
    if (!trackingReplayMode) return;
    if (trackingReplayExhausted) {
      restartTrackingReplayPlayback();
      return;
    }
    trackingReplayPaused = !trackingReplayPaused;
    updateControlButtons(controlsCtx());
    if (trackingReplayPaused) {
      const view = trackingReplayViews[trackingReplayViewIndex] ?? 'follow';
      document.getElementById('tracking-status')!.innerHTML =
        `<strong>已暂停 · ${replayViewLabel(view)}</strong> · 速度 ${trackingSpeed.toFixed(2)}×<br>` +
        `轨迹冻结；球体旋转按当前角速度继续，便于观察旋转方向与转速。`;
    } else {
      spinBillboard.hide();
      applyReplayView(controlsCtx());
    }
  });
  trackingReplayRestartEl.addEventListener('click', () => {
    restartTrackingReplayPlayback();
  });

  return {
    beginRecording,
    recordFrame,
    finalizeRecording,
    isRecordingFinalized: () => trackingRecordingFinalized,
    advanceRecordingClockBy,
    startReplay,
    stopReplay,
    updateReplay,
    refreshCuePointsUi,
    enableAutoReplayForDemo,
    configureFollowOnlyDemoPlayback,
    clearDemoPlaybackPlan,
    beginNextContinuousDemoCycle,
    consumeLiveDemoPass,
    isAutoReplayEnabled: () => trackingAutoReplay,
    syncAutoReplayFromCheckbox: () => { trackingAutoReplay = trackingReplayEl.checked; },
    isReplayMode: () => trackingReplayMode,
    getReplayMesh: () => trackingReplayMesh,
    syncSpinBillboardPosition: () => spinBillboard.syncPosition(trackingReplayMesh.position),
  };
}

function beginRecording(ball: RapierBall, now: number): void {
  trackingRecordingStartedAt = now;
  trackingRecordingFinalized = false;
  trackingRecordingBounceTimes = [];
  trackingRecordingImpactCount = ball.tableImpacts;
  // Anchor sample 0 on the nozzle origin from the feed — not a later body pose.
  trackingReplayLaunchOrigin.copy(deps.machineUiApi.currentMachineBallOrigin);
  const rotation = ball.body.rotation();
  const angularVelocity = ball.body.angvel();
  trackingRecording = [{
    time: 0,
    position: trackingReplayLaunchOrigin.clone(),
    rotation: new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
    angularVelocity: new THREE.Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z),
  }];
}

function recordFrame(now: number, ball: RapierBall): void {
  if (trackingRecordingFinalized) return;
  const recordTime = (now - trackingRecordingStartedAt) / 1000;
  if (ball.tableImpacts > trackingRecordingImpactCount) {
    trackingRecordingImpactCount = ball.tableImpacts;
    trackingRecordingBounceTimes.push(recordTime);
  }
  const position = ball.body.translation();
  const angularVelocity = ball.body.angvel();
  trackingRecording.push({
    time: recordTime,
    position: new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000),
    rotation: ball.mesh.quaternion.clone(),
    angularVelocity: new THREE.Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z),
  });
}

function finalizeRecording(): void {
  trackingRecordingFinalized = true;
  if (trackingRecording.length < 2) return;
  updateControlButtons(controlsCtx());
}

function advanceRecordingClockBy(pausedMs: number): void {
  trackingRecordingStartedAt += pausedMs;
}

function enableAutoReplayForDemo(): void {
  clearDemoPlaybackPlan();
  document.querySelectorAll<HTMLInputElement>('[data-replay-view]').forEach(input => {
    input.checked = true;
  });
  trackingReplayEl.checked = true;
  trackingAutoReplay = true;
  deps.onAutoReplayEnabled();
}

function configureFollowOnlyDemoPlayback(plan: FollowOnlyDemoPlayback): void {
  applyFollowOnlyDemoPlayback(plan, {
    selectFollowOnly: selectFollowViewOnly,
    setReplaySpeed,
    enableAutoReplay: () => {
      trackingReplayEl.checked = true;
      trackingAutoReplay = true;
      deps.onAutoReplayEnabled();
    },
  });
}

function refreshCuePointsUi(): void {
  const recipe = listReplayCueRecipe(deps.machineUiApi.activePreset);
  const canSeek = trackingReplayMode && trackingRecording.length >= 2;
  const detected = canSeek
    ? buildReplayCuePoints(
      trackingRecording.map(frame => ({
        time: frame.time,
        x: frame.position.x,
        y: frame.position.y,
        z: frame.position.z,
      })),
      deps.machineUiApi.activePreset,
      trackingRecordingBounceTimes,
    )
    : [];
  trackingReplayCuePoints = detected;
  const byId = new Map(detected.map(cue => [cue.id, cue]));
  replayCueGridEl.innerHTML = '';
  for (const slot of recipe) {
    const cue = byId.get(slot.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.replayCue = slot.id;
    button.textContent = slot.label;
    button.title = slot.note;
    button.disabled = !cue;
    if (cue) button.addEventListener('click', () => seekCue(controlsCtx(), cue));
    replayCueGridEl.appendChild(button);
  }
  highlightCues(controlsCtx());
}

function stopReplay(): void {
  if (trackingReplaySourceBall) trackingReplaySourceBall.mesh.visible = true;
  trackingReplaySourceBall = null;
  trackingReplayMode = false;
  trackingReplayPaused = false;
  trackingReplayExhausted = false;
  trackingReplayTime = 0;
  trackingReplayMesh.visible = false;
  trackingReplayActiveCueId = null;
  spinBillboard.hide();
  if (deps.receiveStance.hasLockedQuickView()) restoreQuickViewBase(deps.camera, deps.controls);
  updateControlButtons(controlsCtx());
  refreshCuePointsUi();
  deps.machineUiApi.updateMachineOperatingStatus();
  deps.syncWindowIndicators();
}

function startReplay(sourceBall?: RapierBall | null): void {
  if (trackingRecording.length < 2) return;
  // Hide leftover live balls so replay is not confused with a mid-arc remnant.
  deps.machineUiApi.discardBallsExcept(sourceBall ?? null);
  trackingReplaySourceBall = sourceBall ?? null;
  if (trackingReplaySourceBall) trackingReplaySourceBall.mesh.visible = false;
  trackingReplayMode = true;
  trackingReplayPaused = false;
  trackingReplayExhausted = false;
  trackingReplayTime = 0;
  trackingReplayActiveCueId = null;
  trackingReplaySkipNextDelta = true;
  snapRecordingLaunchToOrigin(trackingRecording, trackingReplayLaunchOrigin);
  const slowPlaylist = takeSlowFollowPlaylist();
  if (slowPlaylist) {
    selectFollowViewOnly();
    setReplaySpeed(slowPlaylist.speed);
    trackingReplayViews = slowPlaylist.views;
  } else {
    trackingReplayViews = selectedReplayViews();
  }
  trackingReplayViewIndex = 0;
  trackingReplayMesh.position.copy(trackingRecording[0].position);
  trackingReplayMesh.quaternion.copy(trackingRecording[0].rotation);
  trackingReplayMesh.visible = true;
  // Stay in the child's receive stance — look toward the machine-side launch, do not teleport.
  applyReplayView(controlsCtx());
  deps.controls.target.copy(trackingReplayMesh.position);
  deps.controls.update();
  refreshCuePointsUi();
  updateControlButtons(controlsCtx());
  deps.machineUiApi.updateMachineOperatingStatus();
  deps.syncWindowIndicators();
}

function updateReplay(deltaSeconds: number): void {
  if (!trackingReplayMode) return;
  const followView = (trackingReplayViews[trackingReplayViewIndex] ?? 'follow') === 'follow';
  if (trackingReplayPaused) {
    const pausedFrame = sampleTrackingReplayFrame(trackingRecording, trackingReplayTime);
    advanceTrackingReplaySpin(trackingReplayMesh, pausedFrame.angularVelocity, deltaSeconds, trackingSpeed);
    if (followView) deps.controls.target.copy(trackingReplayMesh.position);
    else {
      updateHighArcFraming({
        camera: deps.camera, controls: deps.controls, ballMm: trackingReplayMesh.position, deltaSeconds,
      });
    }
    return;
  }
  if (trackingReplaySkipNextDelta) {
    trackingReplaySkipNextDelta = false;
    trackingReplayMesh.position.copy(trackingRecording[0].position);
    if (followView) deps.controls.target.copy(trackingReplayMesh.position);
    return;
  }
  trackingReplayTime += deltaSeconds * trackingSpeed;
  const last = trackingRecording[trackingRecording.length - 1];
  const ended = trackingReplayTime >= last.time;
  if (ended) trackingReplayTime = last.time;
  const frame = sampleTrackingReplayFrame(trackingRecording, trackingReplayTime);
  trackingReplayMesh.position.copy(frame.position);
  advanceTrackingReplaySpin(trackingReplayMesh, frame.angularVelocity, deltaSeconds, trackingSpeed);
  syncCueHighlight(controlsCtx(), trackingReplayTime);
  if (followView) {
    deps.controls.target.lerp(trackingReplayMesh.position, 1 - Math.exp(-12 * deltaSeconds));
  } else {
    updateHighArcFraming({
      camera: deps.camera, controls: deps.controls, ballMm: trackingReplayMesh.position, deltaSeconds,
    });
  }
  if (!ended) return;
  if (trackingReplayViewIndex + 1 < trackingReplayViews.length) {
    trackingReplayViewIndex += 1;
    trackingReplayTime = 0;
    trackingReplayActiveCueId = null;
    trackingReplaySkipNextDelta = true;
    trackingReplayMesh.position.copy(trackingRecording[0].position);
    trackingReplayMesh.quaternion.copy(trackingRecording[0].rotation);
    applyReplayView(controlsCtx());
    deps.controls.target.copy(trackingReplayMesh.position);
    deps.controls.update();
    highlightCues(controlsCtx());
    return;
  }
  finishTrackingReplayCycle();
}

function restartTrackingReplayPlayback(): void {
  if (!trackingReplayMode || trackingRecording.length < 2) return;
  trackingReplayExhausted = false;
  trackingReplayPaused = false;
  trackingReplayTime = 0;
  trackingReplayActiveCueId = null;
  trackingReplaySkipNextDelta = true;
  trackingReplayViews = selectedReplayViews();
  trackingReplayViewIndex = 0;
  snapRecordingLaunchToOrigin(trackingRecording, trackingReplayLaunchOrigin);
  trackingReplayMesh.position.copy(trackingRecording[0].position);
  trackingReplayMesh.quaternion.copy(trackingRecording[0].rotation);
  spinBillboard.hide();
  applyReplayView(controlsCtx());
  deps.controls.target.copy(trackingReplayMesh.position);
  deps.controls.update();
  highlightCues(controlsCtx());
  updateControlButtons(controlsCtx());
}

function finishTrackingReplayCycle(): void {
  if (isContinuousFollowDemo()) {
    if (trackingReplaySourceBall) trackingReplaySourceBall.mesh.visible = true;
    trackingReplaySourceBall = null;
    trackingReplayMode = false;
    trackingReplayPaused = false;
    trackingReplayExhausted = false;
    trackingReplayTime = 0;
    trackingReplayMesh.visible = false;
    trackingReplayActiveCueId = null;
    spinBillboard.hide();
    updateControlButtons(controlsCtx());
    refreshCuePointsUi();
    beginNextContinuousDemoCycle();
    deps.onContinuousFollowDemoCycle?.();
    return;
  }
  trackingReplayExhausted = true;
  trackingReplayPaused = true;
  trackingReplayTime = 0;
  trackingReplayViewIndex = 0;
  trackingReplayActiveCueId = null;
  trackingReplayMesh.position.copy(trackingRecording[0].position);
  trackingReplayMesh.quaternion.copy(trackingRecording[0].rotation);
  spinBillboard.hide();
  applyReplayView(controlsCtx());
  highlightCues(controlsCtx());
  updateControlButtons(controlsCtx());
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>本轮回放结束</strong> · ${trackingSpeed.toFixed(2)}×`;
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
