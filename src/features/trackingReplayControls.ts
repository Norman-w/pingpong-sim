//#region 导入/依赖
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import { captureQuickViewBase } from '../highArcFraming';
import type { ReplayCuePoint } from '../replayCuePoints';
import { formatSpinRpm, type SpinBillboardApi } from './spinBillboard';
import type { QuickViewId, ReceiveStanceApi } from './receiveStance';
import { sampleTrackingReplayFrame } from './trackingReplaySampling';
import type { TrackingSnapshot } from './trackingTypes';
import { activeReplayCueIdAt } from './trackingReplaySampling';
//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
export interface ReplayControlsCtx {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  receiveStance: ReceiveStanceApi;
  trackingReplayMesh: THREE.Mesh;
  spinBillboard: SpinBillboardApi;
  replayCueGridEl: HTMLElement;
  trackingReplayPauseEl: HTMLButtonElement;
  trackingReplayRestartEl: HTMLButtonElement;
  getViews: () => QuickViewId[];
  getViewIndex: () => number;
  getRecording: () => TrackingSnapshot[];
  getCuePoints: () => ReplayCuePoint[];
  getActiveCueId: () => ReplayCuePoint['id'] | null;
  setActiveCueId: (id: ReplayCuePoint['id'] | null) => void;
  getReplayTime: () => number;
  setReplayTime: (time: number) => void;
  isReplayMode: () => boolean;
  isPaused: () => boolean;
  isExhausted: () => boolean;
  setPaused: (paused: boolean) => void;
  setExhausted: (exhausted: boolean) => void;
  getSpeed: () => number;
  replayViewLabel: (view: QuickViewId) => string;
}
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
export function applyTrackingReplayView(ctx: ReplayControlsCtx): void {
  const views = ctx.getViews();
  const view = views[ctx.getViewIndex()] ?? 'follow';
  if (view === 'follow') {
    // Do not applyViewPreset here — that snaps to the live end pose.
    // Follow footwork is driven by recorded stanceMm/lookAtMm in updateReplay.
    const frame = sampleTrackingReplayFrame(ctx.getRecording(), ctx.getReplayTime());
    ctx.receiveStance.setQuickViewActive('follow');
    ctx.camera.position.copy(frame.stanceMm);
    ctx.controls.target.copy(frame.lookAtMm);
  } else {
    const preset = ctx.receiveStance.quickViews[view];
    ctx.camera.fov = 45;
    ctx.camera.updateProjectionMatrix();
    ctx.camera.position.set(...preset.position);
    ctx.controls.target.set(...preset.target);
    captureQuickViewBase(ctx.camera, ctx.controls, 45);
    ctx.receiveStance.setQuickViewActive(view);
  }
  ctx.controls.enabled = true;
  ctx.controls.update();
  const followOnly = views.every(item => item === 'follow');
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${followOnly ? '慢放跟球' : '慢放回看'} · ${ctx.replayViewLabel(view)}</strong> · 速度 ${ctx.getSpeed().toFixed(2)}×<br>` +
    `${followOnly ? '跟球+脚步' : '视角'} ${ctx.getViewIndex() + 1}/${views.length}；球体与站位均按实录时间轴复现。`;
}

export function updateReplayControlButtons(ctx: ReplayControlsCtx): void {
  const inReplay = ctx.isReplayMode() && ctx.getRecording().length >= 2;
  ctx.trackingReplayPauseEl.disabled = !inReplay;
  ctx.trackingReplayRestartEl.disabled = !inReplay;
  ctx.trackingReplayPauseEl.classList.toggle('is-playing', inReplay && !ctx.isPaused() && !ctx.isExhausted());
  ctx.trackingReplayPauseEl.classList.toggle('is-paused', inReplay && (ctx.isPaused() || ctx.isExhausted()));
  if (!inReplay) {
    ctx.trackingReplayPauseEl.textContent = '播放';
    return;
  }
  if (ctx.isExhausted()) ctx.trackingReplayPauseEl.textContent = '播放';
  else if (ctx.isPaused()) ctx.trackingReplayPauseEl.textContent = '继续';
  else ctx.trackingReplayPauseEl.textContent = '暂停';
}

export function highlightReplayCueButtons(ctx: ReplayControlsCtx): void {
  ctx.replayCueGridEl.querySelectorAll<HTMLButtonElement>('[data-replay-cue]').forEach(button => {
    const cueId = button.dataset.replayCue as ReplayCuePoint['id'];
    button.classList.toggle('active', cueId === ctx.getActiveCueId());
  });
}

export function seekTrackingReplayCue(ctx: ReplayControlsCtx, cue: ReplayCuePoint): void {
  if (!ctx.isReplayMode()) return;
  ctx.setExhausted(false);
  ctx.setReplayTime(cue.time);
  ctx.setPaused(true);
  ctx.setActiveCueId(cue.id);
  const frame = sampleTrackingReplayFrame(ctx.getRecording(), ctx.getReplayTime());
  ctx.trackingReplayMesh.position.copy(frame.position);
  ctx.trackingReplayMesh.quaternion.copy(frame.rotation);
  if ((ctx.getViews()[ctx.getViewIndex()] ?? 'follow') === 'follow') {
    ctx.camera.position.copy(frame.stanceMm);
    ctx.controls.target.copy(frame.lookAtMm);
    ctx.controls.update();
  }
  highlightReplayCueButtons(ctx);
  updateReplayControlButtons(ctx);
  ctx.spinBillboard.show(cue.label, frame.angularVelocity, ctx.trackingReplayMesh.position);
  const view = ctx.getViews()[ctx.getViewIndex()] ?? 'follow';
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>暂停点 · ${cue.label}</strong> · ${ctx.replayViewLabel(view)} · ${ctx.getSpeed().toFixed(2)}×<br>` +
    formatSpinRpm(frame.angularVelocity);
}

export function syncReplayCueHighlightForTime(ctx: ReplayControlsCtx, time: number): void {
  const nextId = activeReplayCueIdAt(ctx.getCuePoints(), time) as ReplayCuePoint['id'] | null;
  if (nextId === ctx.getActiveCueId()) return;
  ctx.setActiveCueId(nextId);
  highlightReplayCueButtons(ctx);
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
