//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RapierBall } from '../physics';
import { buildReplayCuePoints, listReplayCueRecipe, type ReplayCuePoint } from '../replayCuePoints';
import { captureQuickViewBase, restoreQuickViewBase, updateHighArcFraming } from '../highArcFraming';
import { formatSpinRpm, initSpinBillboard, type SpinBillboardApi } from './spinBillboard';
import type { TrackingSnapshot } from './trackingTypes';
import type { QuickViewId, ReceiveStanceApi } from './receiveStance';
import type { MachineUiApi } from './machineUi';
import {
  clearDemoPlaybackPlan,
  configureFollowOnlyDemoPlayback as applyFollowOnlyDemoPlayback,
  consumeLiveDemoPass,
  selectFollowViewOnly,
  setReplaySpeedUi,
  takeSlowFollowPlaylist,
  type FollowOnlyDemoPlayback,
} from './trackingDemoPlayback';
import { advanceTrackingReplaySpin, sampleTrackingReplayFrame } from './trackingReplaySampling';

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
}

export interface TrackingReplayApi {
  beginRecording: (ball: RapierBall, now: number) => void;
  recordFrame: (now: number, ball: RapierBall) => void;
  finalizeRecording: () => void;
  isRecordingFinalized: () => boolean;
  advanceRecordingClockBy: (pausedMs: number) => void;
  startReplay: (sourceBall: RapierBall) => void;
  stopReplay: () => void;
  updateReplay: (deltaSeconds: number) => void;
  refreshCuePointsUi: () => void;
  enableAutoReplayForDemo: () => void;
  /** Child-lob style: N live follow passes, then M slow follow-only replays. */
  configureFollowOnlyDemoPlayback: (plan: FollowOnlyDemoPlayback) => void;
  clearDemoPlaybackPlan: () => void;
  /** After a live rally ends: another live feed, start slow playlist, or no demo plan. */
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
let trackingReplayCuePoints: ReplayCuePoint[] = [];
let trackingReplayActiveCueId: ReplayCuePoint['id'] | null = null;
let trackingReplayMesh!: THREE.Mesh;
let spinBillboard!: SpinBillboardApi;

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
    updateReplayControlButtons();
    if (trackingReplayPaused) {
      const view = trackingReplayViews[trackingReplayViewIndex] ?? 'follow';
      document.getElementById('tracking-status')!.innerHTML =
        `<strong>已暂停 · ${replayViewLabel(view)}</strong> · 速度 ${trackingSpeed.toFixed(2)}×<br>` +
        `轨迹冻结；球体旋转按当前角速度继续，便于观察旋转方向与转速。`;
    } else {
      spinBillboard.hide();
      applyTrackingReplayView();
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
  const position = ball.body.translation();
  const rotation = ball.body.rotation();
  const angularVelocity = ball.body.angvel();
  trackingRecording = [{
    time: 0,
    position: new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000),
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
  updateReplayControlButtons();
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
    if (cue) button.addEventListener('click', () => seekTrackingReplayCue(cue));
    replayCueGridEl.appendChild(button);
  }
  highlightReplayCueButtons();
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
  updateReplayControlButtons();
  refreshCuePointsUi();
  deps.machineUiApi.updateMachineOperatingStatus();
  deps.syncWindowIndicators();
}

function startReplay(sourceBall: RapierBall): void {
  if (trackingRecording.length < 2) return;
  trackingReplaySourceBall = sourceBall;
  if (trackingReplaySourceBall) trackingReplaySourceBall.mesh.visible = false;
  trackingReplayMode = true;
  trackingReplayPaused = false;
  trackingReplayExhausted = false;
  trackingReplayTime = 0;
  trackingReplayActiveCueId = null;
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
  applyTrackingReplayView();
  refreshCuePointsUi();
  updateReplayControlButtons();
  deps.machineUiApi.updateMachineOperatingStatus();
  deps.syncWindowIndicators();
}

function updateReplay(deltaSeconds: number): void {
  if (!trackingReplayMode) return;
  // Pause freezes trajectory time/position, but keeps spin running so the
  // observer can still read rotation direction and rate at that instant.
  if (trackingReplayPaused) {
    const pausedFrame = sampleTrackingReplayFrame(trackingRecording, trackingReplayTime);
    advanceTrackingReplaySpin(trackingReplayMesh, pausedFrame.angularVelocity, deltaSeconds, trackingSpeed);
    if (deps.receiveStance.activeQuickView === 'follow') deps.controls.target.copy(trackingReplayMesh.position);
    else {
      updateHighArcFraming({
        camera: deps.camera,
        controls: deps.controls,
        ballMm: trackingReplayMesh.position,
        deltaSeconds,
      });
    }
    return;
  }
  trackingReplayTime += deltaSeconds * trackingSpeed;
  const last = trackingRecording[trackingRecording.length - 1];
  const ended = trackingReplayTime >= last.time;
  if (ended) trackingReplayTime = last.time;
  const frame = sampleTrackingReplayFrame(trackingRecording, trackingReplayTime);
  trackingReplayMesh.position.copy(frame.position);
  advanceTrackingReplaySpin(trackingReplayMesh, frame.angularVelocity, deltaSeconds, trackingSpeed);
  syncReplayCueHighlightForTime(trackingReplayTime);
  if (deps.receiveStance.activeQuickView === 'follow') {
    // Keep the replay ball in the observer's gaze with frame-rate-independent
    // smoothing. Locked quick views keep identity and only adjust framing for high arcs.
    const followAlpha = 1 - Math.exp(-12 * deltaSeconds);
    deps.controls.target.lerp(trackingReplayMesh.position, followAlpha);
  } else {
    updateHighArcFraming({
      camera: deps.camera,
      controls: deps.controls,
      ballMm: trackingReplayMesh.position,
      deltaSeconds,
    });
  }
  if (ended) {
    if (trackingReplayViewIndex + 1 < trackingReplayViews.length) {
      trackingReplayViewIndex += 1;
      trackingReplayTime = 0;
      trackingReplayActiveCueId = null;
      trackingReplayMesh.position.copy(trackingRecording[0].position);
      trackingReplayMesh.quaternion.copy(trackingRecording[0].rotation);
      applyTrackingReplayView();
      highlightReplayCueButtons();
      return;
    }
    // Keep the recording mounted so the same rally can be replayed repeatedly.
    finishTrackingReplayCycle();
  }
}

//#endregion

//#region 业务逻辑
function applyTrackingReplayView(): void {
  const view = trackingReplayViews[trackingReplayViewIndex] ?? 'follow';
  if (view === 'follow') {
    deps.receiveStance.applyViewPreset();
    deps.controls.target.copy(trackingReplayMesh.position);
  } else {
    const preset = deps.receiveStance.quickViews[view];
    deps.camera.fov = 45;
    deps.camera.updateProjectionMatrix();
    deps.camera.position.set(...preset.position);
    deps.controls.target.set(...preset.target);
    captureQuickViewBase(deps.camera, deps.controls, 45);
    deps.receiveStance.setQuickViewActive(view);
  }
  deps.controls.enabled = true;
  deps.controls.update();
  const followOnlyPlaylist = trackingReplayViews.every(item => item === 'follow');
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${followOnlyPlaylist ? '慢放跟球' : '慢放回看'} · ${replayViewLabel(view)}</strong> · 速度 ${trackingSpeed.toFixed(2)}×<br>` +
    `${followOnlyPlaylist ? '跟球视角' : '视角'} ${trackingReplayViewIndex + 1}/${trackingReplayViews.length}；球体位置与旋转均按实录复现。`;
}

function updateReplayControlButtons(): void {
  const inReplay = trackingReplayMode && trackingRecording.length >= 2;
  trackingReplayPauseEl.disabled = !inReplay;
  trackingReplayRestartEl.disabled = !inReplay;
  trackingReplayPauseEl.classList.toggle('is-playing', inReplay && !trackingReplayPaused && !trackingReplayExhausted);
  trackingReplayPauseEl.classList.toggle('is-paused', inReplay && (trackingReplayPaused || trackingReplayExhausted));
  if (!inReplay) {
    trackingReplayPauseEl.textContent = '播放';
    return;
  }
  if (trackingReplayExhausted) {
    trackingReplayPauseEl.textContent = '播放';
  } else if (trackingReplayPaused) {
    trackingReplayPauseEl.textContent = '继续';
  } else {
    trackingReplayPauseEl.textContent = '暂停';
  }
}

function highlightReplayCueButtons(): void {
  const buttons = replayCueGridEl.querySelectorAll<HTMLButtonElement>('[data-replay-cue]');
  buttons.forEach(button => {
    const cueId = button.dataset.replayCue as ReplayCuePoint['id'];
    button.classList.toggle('active', cueId === trackingReplayActiveCueId);
  });
}

function seekTrackingReplayCue(cue: ReplayCuePoint): void {
  if (!trackingReplayMode) return;
  trackingReplayExhausted = false;
  trackingReplayTime = cue.time;
  trackingReplayPaused = true;
  trackingReplayActiveCueId = cue.id;
  const frame = sampleTrackingReplayFrame(trackingRecording, trackingReplayTime);
  trackingReplayMesh.position.copy(frame.position);
  trackingReplayMesh.quaternion.copy(frame.rotation);
  if (deps.receiveStance.activeQuickView === 'follow') deps.controls.target.copy(trackingReplayMesh.position);
  highlightReplayCueButtons();
  updateReplayControlButtons();
  spinBillboard.show(cue.label, frame.angularVelocity, trackingReplayMesh.position);
  const view = trackingReplayViews[trackingReplayViewIndex] ?? 'follow';
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>暂停点 · ${cue.label}</strong> · ${replayViewLabel(view)} · ${trackingSpeed.toFixed(2)}×<br>` +
    formatSpinRpm(frame.angularVelocity);
}

function restartTrackingReplayPlayback(): void {
  if (!trackingReplayMode || trackingRecording.length < 2) return;
  trackingReplayExhausted = false;
  trackingReplayPaused = false;
  trackingReplayTime = 0;
  trackingReplayActiveCueId = null;
  trackingReplayViews = selectedReplayViews();
  trackingReplayViewIndex = 0;
  trackingReplayMesh.position.copy(trackingRecording[0].position);
  trackingReplayMesh.quaternion.copy(trackingRecording[0].rotation);
  spinBillboard.hide();
  applyTrackingReplayView();
  highlightReplayCueButtons();
  updateReplayControlButtons();
}

function finishTrackingReplayCycle(): void {
  trackingReplayExhausted = true;
  trackingReplayPaused = true;
  trackingReplayTime = 0;
  trackingReplayViewIndex = 0;
  trackingReplayActiveCueId = null;
  trackingReplayMesh.position.copy(trackingRecording[0].position);
  trackingReplayMesh.quaternion.copy(trackingRecording[0].rotation);
  spinBillboard.hide();
  applyTrackingReplayView();
  highlightReplayCueButtons();
  updateReplayControlButtons();
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>本轮回放结束</strong> · 速度 ${trackingSpeed.toFixed(2)}×<br>` +
    `可点「播放/重播」再次观看，或点选关键暂停点；关闭慢放回看后继续下一球。`;
}

function syncReplayCueHighlightForTime(time: number): void {
  if (trackingReplayCuePoints.length === 0) return;
  let active: ReplayCuePoint | null = null;
  for (const cue of trackingReplayCuePoints) {
    if (cue.time <= time + 1e-3) active = cue;
  }
  const nextId = active?.id ?? null;
  if (nextId === trackingReplayActiveCueId) return;
  trackingReplayActiveCueId = nextId;
  highlightReplayCueButtons();
}
//#endregion
