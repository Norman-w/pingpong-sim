//#region 导入/依赖
import * as THREE from 'three';
import type { QuickViewId } from './receiveStance';

//#endregion

//#region 常量/配置
const DEFAULT_DEMO_SLOW_SPEED = 0.2;
//#endregion

//#region 模型/类型
export interface FollowOnlyDemoPlayback {
  livePasses: number;
  slowPasses: number;
  slowSpeed?: number;
  /** After slow passes finish, roll a new ball and repeat the playlist. */
  continuous?: boolean;
}

export type LiveDemoPassAction = 'continue-live' | 'start-replay' | 'none';

/** Follow playlist after the first recorded live ball (full-speed leftovers + slow). */
export interface FollowReplayPlaylist {
  views: QuickViewId[];
  speeds: number[];
}
//#endregion

//#region 私有成员
/** Remaining live follow passes including the ball currently in flight. */
let demoLivePassesRemaining = 0;
let demoSlowPassCount = 0;
let demoSlowSpeed = DEFAULT_DEMO_SLOW_SPEED;
let demoContinuous = false;
let demoLivePassesTemplate = 2;
let demoSlowPassesTemplate = 2;
//#endregion

//#region 公开 API
export function clearDemoPlaybackPlan(): void {
  demoLivePassesRemaining = 0;
  demoSlowPassCount = 0;
  demoContinuous = false;
}

export function configureFollowOnlyDemoPlayback(
  plan: FollowOnlyDemoPlayback,
  applyUi: { selectFollowOnly: () => void; setReplaySpeed: (speed: number) => void; enableAutoReplay: () => void },
): void {
  demoLivePassesTemplate = Math.max(1, Math.floor(plan.livePasses));
  demoSlowPassesTemplate = Math.max(0, Math.floor(plan.slowPasses));
  demoLivePassesRemaining = demoLivePassesTemplate;
  demoSlowPassCount = demoSlowPassesTemplate;
  demoSlowSpeed = plan.slowSpeed ?? DEFAULT_DEMO_SLOW_SPEED;
  demoContinuous = Boolean(plan.continuous);
  applyUi.selectFollowOnly();
  applyUi.setReplaySpeed(demoSlowSpeed);
  applyUi.enableAutoReplay();
}

export function consumeLiveDemoPass(): LiveDemoPassAction {
  if (demoLivePassesRemaining <= 0 && demoSlowPassCount <= 0) return 'none';
  if (demoLivePassesRemaining <= 0) {
    return demoSlowPassCount > 0 ? 'start-replay' : 'none';
  }
  demoLivePassesRemaining -= 1;
  // Only the first live is a real feed. Remaining "live" passes replay that
  // same recording at 1× so ball path and footwork stay identical across the cycle.
  if (demoLivePassesRemaining > 0 || demoSlowPassCount > 0) return 'start-replay';
  return 'none';
}

/** Build playlist after the recorded live ball: leftover lives at 1×, then slow passes. */
export function takeSlowFollowPlaylist(): FollowReplayPlaylist | null {
  const fullSpeedCount = Math.max(0, demoLivePassesRemaining);
  const slowCount = Math.max(0, demoSlowPassCount);
  if (fullSpeedCount <= 0 && slowCount <= 0) return null;
  const views: QuickViewId[] = [
    ...Array.from({ length: fullSpeedCount }, () => 'follow' as QuickViewId),
    ...Array.from({ length: slowCount }, () => 'follow' as QuickViewId),
  ];
  const speeds = [
    ...Array.from({ length: fullSpeedCount }, () => 1),
    ...Array.from({ length: slowCount }, () => demoSlowSpeed),
  ];
  demoLivePassesRemaining = 0;
  demoSlowPassCount = 0;
  return { views, speeds };
}

export function isContinuousFollowDemo(): boolean {
  return demoContinuous;
}

/** Reset live/slow counters for the next continuous cycle (keeps continuous flag). */
export function beginNextContinuousDemoCycle(): void {
  if (!demoContinuous) return;
  demoLivePassesRemaining = demoLivePassesTemplate;
  demoSlowPassCount = demoSlowPassesTemplate;
}

export function selectFollowViewOnly(): void {
  document.querySelectorAll<HTMLInputElement>('[data-replay-view]').forEach(input => {
    input.checked = input.dataset.replayView === 'follow';
  });
}

export function setReplaySpeedUi(
  speed: number,
  trackingSpeedEl: HTMLInputElement,
  trackingSpeedValueEl: HTMLElement,
): number {
  const next = THREE.MathUtils.clamp(speed, 0.05, 1);
  trackingSpeedEl.value = String(next);
  trackingSpeedValueEl.textContent = `${next.toFixed(2)}×`;
  return next;
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
