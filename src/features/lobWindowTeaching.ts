//#region 导入/依赖
import * as THREE from 'three';
import {
  buildReceiverReachModel,
  capabilityForLevel,
  canReachContact,
  detectWindowAEnd,
  isInWindowARise,
  NET_HEIGHT_MM,
  pickWindowBContactOnArc,
  retreatStanceForContact,
  secondsToApex,
  type ReceiverReachModel,
} from '../domain/lobProcessability';
import { CONTACT_TECHNIQUES } from '../domain/contactRules';
import type { TrackingSession } from './trackingTypes';
import type { ReceiveStanceApi } from './receiveStance';
import type { PlayerLevel } from '../serveMachine';

//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
export interface LobWindowTeachingDeps {
  TABLE_TOP_Y: number;
  TABLE_LENGTH: number;
  BALL_RADIUS: number;
  receiveStance: ReceiveStanceApi;
  camera: THREE.PerspectiveCamera;
  getReceiverLevel: () => PlayerLevel;
  setTrackingStatus: (phase: TrackingSession['phase'], detail: string) => void;
}
//#endregion

//#region 私有成员
let deps!: LobWindowTeachingDeps;

function currentModel(): ReceiverReachModel {
  const profile = deps.receiveStance.currentReceiverProfile();
  const levelBits = capabilityForLevel(deps.getReceiverLevel());
  return buildReceiverReachModel(deps.receiveStance.viewHeightMm, {
    moveSpeedMmPerSec: profile.moveSpeedMmPerSec,
    reachAllowanceMm: profile.reachAllowanceMm,
    reactionMs: profile.reactionMs,
    stepInDepthScale: levelBits.stepInDepthScale,
    jumpGainMm: levelBits.jumpGainMm,
  });
}

function placeWindowAGuideOnArc(
  ballPoint: THREE.Vector3,
  velocity: { x: number; y: number; z: number },
): void {
  const model = currentModel();
  const netY = deps.TABLE_TOP_Y + NET_HEIGHT_MM;
  const floorY = deps.TABLE_TOP_Y + deps.BALL_RADIUS;
  if (
    velocity.y > 0 &&
    ballPoint.y >= netY &&
    ballPoint.y <= model.jumpContactYMm + 24 &&
    ballPoint.y >= floorY
  ) {
    deps.receiveStance.placeContactGuide(ballPoint, true);
    return;
  }
  for (let t = 0.02; t <= 1.2; t += 0.03) {
    const x = ballPoint.x + velocity.x * 1000 * t;
    const y = ballPoint.y + velocity.y * 1000 * t - 0.5 * 9810 * t * t;
    const z = ballPoint.z + velocity.z * 1000 * t;
    const vy = velocity.y * 1000 - 9810 * t;
    if (y < floorY) break;
    if (vy <= 0) break;
    if (y >= netY && y <= model.jumpContactYMm + 24) {
      deps.receiveStance.placeContactGuide(new THREE.Vector3(x, y, z), true);
      return;
    }
  }
  deps.receiveStance.placeContactGuide(ballPoint, true);
}

function applyWindowBGuideAndRetreat(
  session: TrackingSession,
  ballPoint: THREE.Vector3,
  velocity: { x: number; y: number; z: number },
): void {
  const model = currentModel();
  const recovery = pickWindowBContactOnArc({
    ball: { x: ballPoint.x, y: ballPoint.y, z: ballPoint.z },
    velocityMps: { x: velocity.x, y: velocity.y, z: velocity.z },
    model,
    ballRadiusMm: deps.BALL_RADIUS,
    postBounceApexSeen: session.lobPostBounceApexSeen,
  });
  const anchor = recovery ?? { x: ballPoint.x, y: ballPoint.y, z: ballPoint.z };
  if (recovery) {
    deps.receiveStance.placeContactGuide(new THREE.Vector3(recovery.x, recovery.y, recovery.z), true);
    deps.receiveStance.setContactGuideState('hittable');
  }
  const smashForwardMm = CONTACT_TECHNIQUES.smash.forwardMm;
  const stance = retreatStanceForContact(anchor, deps.TABLE_LENGTH, 5000, smashForwardMm);
  session.lobRetreatStanceX = stance.x;
  deps.receiveStance.autoDepthOverrideX = stance.x;
  if (deps.receiveStance.stanceMode === 'auto') {
    deps.receiveStance.autoContactZ = THREE.MathUtils.clamp(anchor.z, -1582.5, 57.5);
  }
}
//#endregion

//#region 公开 API
export function initLobWindowTeaching(teachingDeps: LobWindowTeachingDeps): {
  updateLobWindowATeaching: (
    session: TrackingSession,
    ballPoint: THREE.Vector3,
    velocity: { x: number; y: number; z: number },
    now: number,
    isLobPreset: boolean,
    receiveBounceCount: number,
  ) => void;
  currentStandingContactYMm: () => number;
} {
  deps = teachingDeps;
  return {
    updateLobWindowATeaching,
    currentStandingContactYMm: () => currentModel().standingContactYMm,
  };
}

export function createLobSessionFields(): Pick<
  TrackingSession,
  | 'lobEnteredWindowA'
  | 'lobWindowAMissSignaled'
  | 'lobPreferWindowB'
  | 'lobHandledInWindowA'
  | 'lobPostBounceApexSeen'
  | 'lobWindowAEnteredAt'
  | 'lobWindowAPoint'
  | 'lobRetreatStanceX'
> {
  return {
    lobEnteredWindowA: false,
    lobWindowAMissSignaled: false,
    lobPreferWindowB: false,
    lobHandledInWindowA: false,
    lobPostBounceApexSeen: false,
    lobWindowAEnteredAt: 0,
    lobWindowAPoint: null,
    lobRetreatStanceX: null,
  };
}
//#endregion

//#region 业务逻辑
function updateLobWindowATeaching(
  session: TrackingSession,
  ballPoint: THREE.Vector3,
  velocity: { x: number; y: number; z: number },
  now: number,
  isLobPreset: boolean,
  receiveBounceCount: number,
): void {
  if (!isLobPreset) return;
  if (session.phase === 'contact-hold' || session.phase === 'post-contact-source') return;

  const bounced = session.ball.tableImpacts >= receiveBounceCount;
  if (bounced && session.previousVy > 0 && velocity.y <= 0) {
    session.lobPostBounceApexSeen = true;
  }

  if (session.lobPreferWindowB) {
    applyWindowBGuideAndRetreat(session, ballPoint, velocity);
    // Missed A: stay on the ball until window B contact — never glance at the machine.
    if (session.phase === 'look-back' || session.phase === 'reacquire' || session.phase === 'follow-launch') {
      session.phase = 'follow-contact';
      session.phaseStartedAt = now;
    }
    return;
  }

  if (bounced) placeWindowAGuideOnArc(ballPoint, velocity);

  const inRise = isInWindowARise({
    bounced,
    ballYMm: ballPoint.y,
    velocityYMps: velocity.y,
    tableTopYMm: deps.TABLE_TOP_Y,
  });
  if (inRise && !session.lobEnteredWindowA) {
    session.lobEnteredWindowA = true;
    session.lobWindowAEnteredAt = now;
    session.lobWindowAPoint = ballPoint.clone();
  } else if (inRise && session.lobWindowAPoint) {
    if (ballPoint.y < session.lobWindowAPoint.y) session.lobWindowAPoint.copy(ballPoint);
  }
  if (!session.lobEnteredWindowA || !session.lobWindowAPoint) return;

  const model = currentModel();
  const stance = deps.receiveStance.effectiveStancePose();
  const preferred = session.lobWindowAPoint;
  const canReachPreferred = canReachContact({
    stance: { x: stance.x, z: stance.z },
    stanceFootX: deps.camera.position.x,
    stanceFootZ: deps.camera.position.z,
    ball: { x: preferred.x, y: preferred.y, z: preferred.z },
    model,
    remainingSeconds: Math.max(0.05, secondsToApex(velocity.y)),
    allowJump: true,
    autoFootwork: deps.receiveStance.stanceMode === 'auto',
  });
  const endReason = detectWindowAEnd({
    previousVyMps: session.previousVy,
    velocityYMps: velocity.y,
    ball: { x: ballPoint.x, y: ballPoint.y, z: ballPoint.z },
    model,
    enteredWindowA: session.lobEnteredWindowA,
    canReachPreferredBeforeApex: canReachPreferred,
    elapsedInWindowASec: (now - session.lobWindowAEnteredAt) / 1000,
  });
  if (!endReason || session.lobHandledInWindowA || session.lobWindowAMissSignaled) return;

  session.lobWindowAMissSignaled = true;
  session.lobPreferWindowB = true;
  if (endReason === 'apex') session.lobPostBounceApexSeen = true;
  deps.receiveStance.pinMissedPreferredMarker(session.lobWindowAPoint);
  applyWindowBGuideAndRetreat(session, ballPoint, velocity);
  if (session.phase === 'look-back' || session.phase === 'reacquire' || session.phase === 'follow-launch') {
    session.phase = 'follow-contact';
    session.phaseStartedAt = now;
  }
  deps.receiveStance.showReceiveFailure('错过第一合理处理点：落台后上升初期的可下压窗口');
  deps.setTrackingStatus(
    session.phase,
    `已错过第一合理处理点（${endReason === 'apex' ? '过最高点' : '仿真够不着'}）。` +
      '继续跟球后退等待下降窗口；橙色为错过的窗口A，青色为窗口B。',
  );
}
//#endregion

//#region 方法/工具
//#endregion
