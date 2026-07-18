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
}

export type LiveDemoPassAction = 'continue-live' | 'start-replay' | 'none';
//#endregion

//#region 私有成员
/** Remaining live follow passes including the ball currently in flight. */
let demoLivePassesRemaining = 0;
let demoSlowPassCount = 0;
let demoSlowSpeed = DEFAULT_DEMO_SLOW_SPEED;
//#endregion

//#region 公开 API
export function clearDemoPlaybackPlan(): void {
  demoLivePassesRemaining = 0;
  demoSlowPassCount = 0;
}

export function configureFollowOnlyDemoPlayback(
  plan: FollowOnlyDemoPlayback,
  applyUi: { selectFollowOnly: () => void; setReplaySpeed: (speed: number) => void; enableAutoReplay: () => void },
): void {
  demoLivePassesRemaining = Math.max(1, Math.floor(plan.livePasses));
  demoSlowPassCount = Math.max(0, Math.floor(plan.slowPasses));
  demoSlowSpeed = plan.slowSpeed ?? DEFAULT_DEMO_SLOW_SPEED;
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
  if (demoLivePassesRemaining > 0) return 'continue-live';
  return demoSlowPassCount > 0 ? 'start-replay' : 'none';
}

/** Build and consume the slow follow-only playlist for startReplay, or null if none. */
export function takeSlowFollowPlaylist(): { views: QuickViewId[]; speed: number } | null {
  if (demoSlowPassCount <= 0) return null;
  const views = Array.from({ length: demoSlowPassCount }, () => 'follow' as QuickViewId);
  const speed = demoSlowSpeed;
  demoSlowPassCount = 0;
  return { views, speed };
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
