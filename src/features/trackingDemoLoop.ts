//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getBalls, type RapierBall } from '../physics';
import {
  BOUNCE_REQUIRED_TECHNIQUES,
  CONTACT_TECHNIQUES,
  TABLE_TECHNIQUES,
  receivePreparationMs,
} from '../domain/contactRules';
import { secondsToApex } from '../domain/lobProcessability';
import { updateHighArcFraming } from '../highArcFraming';
import type { IncomingSource, TrackingSession } from './trackingTypes';
import type { ReceiveStanceApi } from './receiveStance';
import type { MachineUiApi } from './machineUi';
import type { TrackingReplayApi } from './trackingReplay';
import type { initLobWindowTeaching } from './lobWindowTeaching';

//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
/** Subset of tracking-demo wiring needed by the per-frame phase loop. */
export interface TrackingLoopDeps {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  TABLE_TOP_Y: number;
  BALL_RADIUS: number;
  receiveStance: ReceiveStanceApi;
  machineUiApi: MachineUiApi;
  trackingReplay: TrackingReplayApi;
}

export interface TrackingDemoLoopContext {
  deps: TrackingLoopDeps;
  trackingTarget: THREE.Vector3;
  machineLookPoint: THREE.Vector3;
  incomingSource: IncomingSource;
  lobTeaching: ReturnType<typeof initLobWindowTeaching>;
  trackingContinuous: boolean;
  trackingQueue: RapierBall[];
  setTrackingStatus: (phase: TrackingSession['phase'], detail?: string) => void;
  turnViewAtHumanSpeed: (desiredTarget: THREE.Vector3, deltaSeconds: number) => void;
  stopTrackingDemo: () => void;
  beginTrackingBall: (ball: RapierBall, now: number, snapCamera: boolean, skipSourceGlance: boolean) => void;
  clearTrackingSession: () => void;
}
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
export function runTrackingDemoFrame(
  ctx: TrackingDemoLoopContext,
  session: TrackingSession,
  now: number,
  deltaSeconds: number,
): void {
  const { deps, trackingTarget, machineLookPoint, incomingSource, lobTeaching } = ctx;
  if (!getBalls().includes(session.ball)) {
    ctx.stopTrackingDemo();
    return;
  }
  const position = session.ball.body.translation();
  const velocity = session.ball.body.linvel();
  const ballPoint = new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000);
  deps.trackingReplay.recordFrame(now, session.ball);
  appendTrackingTrail(deps, ballPoint);

  const elapsedInPhase = now - session.phaseStartedAt;
  const receiveBounceCount = deps.receiveStance.requiredReceiveBounceCount();
  if (
    TABLE_TECHNIQUES.has(deps.receiveStance.contactTechnique) &&
    session.ball.tableImpacts === receiveBounceCount &&
    session.ball.lastTableImpact
  ) {
    deps.receiveStance.trackedReceiveBounceX = session.ball.lastTableImpact.x * 1000;
  }

  const receiver = deps.receiveStance.currentReceiverProfile();
  if (now - session.startedAt >= receiver.reactionMs * 0.35) {
    deps.receiveStance.moveAutomaticStanceForBall(ballPoint, velocity, deltaSeconds);
  }

  const isLobPreset = deps.machineUiApi.activePreset.id === 'lob';
  lobTeaching.updateLobWindowATeaching(session, ballPoint, velocity, now, isLobPreset, receiveBounceCount);

  const guide = deps.receiveStance.contactGuidePosition();
  const { trajectoryGuide, secondsToGuide, hasTrajectoryProjection, lobArcGuide } =
    resolveTrajectoryGuide(deps, session, isLobPreset, guide, ballPoint, position, velocity, receiveBounceCount);

  if (hasTrajectoryProjection && session.phase !== 'contact-hold' && session.phase !== 'post-contact-source') {
    const predictedFailure = deps.receiveStance.contactFailureReason(
      trajectoryGuide,
      guide,
      Math.max(1, session.ball.tableImpacts),
      secondsToGuide,
    );
    deps.receiveStance.setContactGuideState(predictedFailure ? 'unreachable' : 'hittable');
  }
  const distanceToGuide = ballPoint.distanceTo(trajectoryGuide);
  if (session.ball.tableImpacts >= receiveBounceCount && distanceToGuide < session.closestDistance) {
    session.closestDistance = distanceToGuide;
    session.closestPoint.copy(ballPoint);
  }

  advanceTrackingPhases(ctx, session, {
    now,
    elapsedInPhase,
    ballPoint,
    position,
    velocity,
    receiver,
    guide,
    trajectoryGuide,
    lobArcGuide,
    receiveBounceCount,
  });

  if (session.phase === 'post-contact-source' && elapsedInPhase > 420) {
    if (deps.trackingReplay.isAutoReplayEnabled() && deps.trackingReplay.isRecordingFinalized()) {
      ctx.clearTrackingSession();
      deps.trackingReplay.startReplay(session.ball);
      return;
    }
    if (ctx.trackingContinuous && ctx.trackingQueue.length > 0) {
      ctx.beginTrackingBall(ctx.trackingQueue.shift()!, now, false, true);
      return;
    }
  }

  if (!deps.trackingReplay.isRecordingFinalized() && session.phase === 'contact-hold') {
    deps.trackingReplay.finalizeRecording();
  }

  session.previousVy = velocity.y;
  if (deps.receiveStance.hasLockedQuickView()) {
    updateHighArcFraming({
      camera: deps.camera,
      controls: deps.controls,
      ballMm: ballPoint,
      deltaSeconds,
    });
    return;
  }
  if (session.phase === 'post-contact-source') {
    ctx.turnViewAtHumanSpeed(trackingTarget, deltaSeconds);
  } else {
    const isLobFollow = deps.machineUiApi.activePreset.id === 'lob' || session.lobPreferWindowB;
    const followRate = session.phase === 'contact-hold' ? 0.22 : isLobFollow ? 0.45 : 0.30;
    deps.controls.target.lerp(trackingTarget, followRate);
  }
}
//#endregion

//#region 业务逻辑
function appendTrackingTrail(deps: TrackingLoopDeps, ballPoint: THREE.Vector3): void {
  const lastTrailPoint = deps.receiveStance.trackingTrailPoints[deps.receiveStance.trackingTrailPoints.length - 1];
  if (!lastTrailPoint || lastTrailPoint.distanceTo(ballPoint) > 18) {
    deps.receiveStance.trackingTrailPoints.push(ballPoint.clone());
    if (deps.receiveStance.trackingTrailPoints.length > 360) deps.receiveStance.trackingTrailPoints.shift();
    deps.receiveStance.trackingTrailLine.geometry.dispose();
    deps.receiveStance.trackingTrailLine.geometry = new THREE.BufferGeometry().setFromPoints(
      deps.receiveStance.trackingTrailPoints,
    );
  }
}

function resolveTrajectoryGuide(
  deps: TrackingLoopDeps,
  session: TrackingSession,
  isLobPreset: boolean,
  guide: THREE.Vector3,
  ballPoint: THREE.Vector3,
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  receiveBounceCount: number,
): {
  trajectoryGuide: THREE.Vector3;
  secondsToGuide: number;
  hasTrajectoryProjection: boolean;
  lobArcGuide: THREE.Vector3 | null;
} {
  const lobArcGuide = isLobPreset &&
    (session.lobEnteredWindowA || session.lobPreferWindowB) &&
    deps.receiveStance.contactGuideMarker.visible
    ? deps.receiveStance.contactGuideMarker.position.clone()
    : null;
  let trajectoryGuide = lobArcGuide ?? guide;
  let secondsToGuide = 0;
  let hasTrajectoryProjection = false;
  // Lob window teaching owns the cyan marker once window A/B is active.
  if (
    !lobArcGuide &&
    session.ball.tableImpacts >= receiveBounceCount &&
    velocity.x > 0.05 &&
    ballPoint.x < guide.x
  ) {
    const timeToPlane = (guide.x / 1000 - position.x) / velocity.x;
    const projected = new THREE.Vector3(
      guide.x,
      ballPoint.y + velocity.y * 1000 * timeToPlane - 0.5 * 9810 * timeToPlane ** 2,
      ballPoint.z + velocity.z * 1000 * timeToPlane,
    );
    if (
      timeToPlane > 0 &&
      timeToPlane < 1.5 &&
      projected.y > deps.TABLE_TOP_Y + deps.BALL_RADIUS &&
      projected.y < 2400
    ) {
      trajectoryGuide = projected;
      secondsToGuide = timeToPlane;
      hasTrajectoryProjection = true;
      if (deps.receiveStance.contactGuideMarker.visible) deps.receiveStance.placeContactGuide(projected, true);
    }
  }
  if (lobArcGuide && velocity.x > 0.05 && ballPoint.x < lobArcGuide.x) {
    secondsToGuide = (lobArcGuide.x / 1000 - position.x) / velocity.x;
    hasTrajectoryProjection = secondsToGuide > 0 && secondsToGuide < 2.2;
  }
  return { trajectoryGuide, secondsToGuide, hasTrajectoryProjection, lobArcGuide };
}

function advanceTrackingPhases(
  ctx: TrackingDemoLoopContext,
  session: TrackingSession,
  args: {
    now: number;
    elapsedInPhase: number;
    ballPoint: THREE.Vector3;
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    receiver: { reactionMs: number };
    guide: THREE.Vector3;
    trajectoryGuide: THREE.Vector3;
    lobArcGuide: THREE.Vector3 | null;
    receiveBounceCount: number;
  },
): void {
  const { deps, trackingTarget, machineLookPoint, incomingSource, setTrackingStatus } = ctx;
  const {
    now, elapsedInPhase, ballPoint, position, velocity, receiver,
    guide, trajectoryGuide, lobArcGuide, receiveBounceCount,
  } = args;

  const isLobPreset = deps.machineUiApi.activePreset.id === 'lob';
  // Lob / missed-A recovery: never glance at the machine before real contact.
  const holdGazeOnBall = isLobPreset || session.lobPreferWindowB;

  if (session.phase === 'follow-launch') {
    trackingTarget.copy(ballPoint);
    const passedApex = session.previousVy > 0 && velocity.y <= 0;
    const launchedDownward = now - session.startedAt > 180 && session.previousVy <= 0 && velocity.y <= session.previousVy;
    if (passedApex || launchedDownward) {
      session.apexPoint.copy(ballPoint);
      if (holdGazeOnBall) {
        session.phase = 'follow-contact';
        session.phaseStartedAt = now;
        setTrackingStatus('follow-contact', '持续跟球至可处理击球点。');
      } else {
        session.phase = 'look-back';
        session.phaseStartedAt = now;
        setTrackingStatus('look-back', `最高点约 ${Math.round(ballPoint.y)} mm；短暂确认发球机方向。`);
      }
    }
    return;
  }

  if (session.phase === 'look-back') {
    if (holdGazeOnBall) {
      session.phase = 'follow-contact';
      session.phaseStartedAt = now;
      trackingTarget.copy(ballPoint);
      return;
    }
    machineLookPoint.copy(incomingSource.position());
    trackingTarget.lerp(machineLookPoint, 0.13);
    if (elapsedInPhase > receiver.reactionMs * 0.6) {
      session.phase = 'reacquire';
      session.phaseStartedAt = now;
      setTrackingStatus('reacquire');
    }
    return;
  }

  if (session.phase === 'reacquire') {
    trackingTarget.lerp(ballPoint, holdGazeOnBall ? 0.35 : 0.2);
    if (holdGazeOnBall && deps.machineUiApi.activePreset.mode !== 'serve') {
      session.phase = 'follow-contact';
      session.phaseStartedAt = now;
      trackingTarget.copy(ballPoint);
      return;
    }
    const reacquireMs = deps.machineUiApi.activePreset.mode === 'serve'
      ? receiver.reactionMs + receivePreparationMs(deps.receiveStance.contactTechnique)
      : receiver.reactionMs * 0.4;
    if (elapsedInPhase > reacquireMs) {
      session.phase = 'follow-contact';
      session.phaseStartedAt = now;
      setTrackingStatus(
        'follow-contact',
        `青色标记为${CONTACT_TECHNIQUES[deps.receiveStance.contactTechnique].timing}的建议击球点。`,
      );
    }
    return;
  }

  if (session.phase === 'follow-contact') {
    trackingTarget.copy(ballPoint);
    resolveFollowContact(ctx, session, {
      now, ballPoint, position, velocity, guide, trajectoryGuide, lobArcGuide, receiveBounceCount,
    });
    return;
  }

  if (session.phase === 'contact-hold') {
    trackingTarget.copy(session.actualPoint);
    if (elapsedInPhase > 140) {
      session.phase = 'post-contact-source';
      session.phaseStartedAt = now;
      setTrackingStatus('post-contact-source', session.contactFailed
        ? `本球处理失败，视线仍按真实反应回看${incomingSource.label}，再准备下一球。`
        : `击球完成，先回看${incomingSource.label}，再捕捉下一球。`);
    }
    return;
  }

  if (session.phase === 'post-contact-source') {
    trackingTarget.copy(incomingSource.position());
  }
}

function resolveFollowContact(
  ctx: TrackingDemoLoopContext,
  session: TrackingSession,
  args: {
    now: number;
    ballPoint: THREE.Vector3;
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    guide: THREE.Vector3;
    trajectoryGuide: THREE.Vector3;
    lobArcGuide: THREE.Vector3 | null;
    receiveBounceCount: number;
  },
): void {
  const { deps, lobTeaching, setTrackingStatus } = ctx;
  const { now, ballPoint, position, velocity, guide, trajectoryGuide, lobArcGuide, receiveBounceCount } = args;
  const hasRequiredBounce =
    !BOUNCE_REQUIRED_TECHNIQUES.has(deps.receiveStance.contactTechnique) ||
    session.ball.tableImpacts >= receiveBounceCount;
  const contactPlaneX = lobArcGuide?.x ?? guide.x;
  const reachedContactPlane = position.x * 1000 >= contactPlaneX;
  const windowBReady = !session.lobPreferWindowB || (
    session.lobPostBounceApexSeen &&
    velocity.y <= 0 &&
    ballPoint.y <= lobTeaching.currentStandingContactYMm() + 40
  );
  // Window A cyan guide sits on the live ball — X-plane alone would always
  // "contact". Smash only counts if the early preferred near-net point is in
  // the reach fan; a ball that later drifts closer must not count as "够到了".
  const inLobWindowA = session.lobEnteredWindowA && !session.lobPreferWindowB;
  if (inLobWindowA && reachedContactPlane && hasRequiredBounce) {
    const preferred = session.lobWindowAPoint ?? ballPoint;
    const secondsLeft = Math.max(0.05, secondsToApex(velocity.y));
    if (!lobTeaching.canReachLobContact(preferred, secondsLeft, true)) {
      return;
    }
  }

  if (reachedContactPlane && hasRequiredBounce && windowBReady) {
    session.phase = 'contact-hold';
    session.phaseStartedAt = now;
    session.actualPoint.copy(ballPoint);
    if (!session.lobPreferWindowB && session.lobEnteredWindowA) {
      session.lobHandledInWindowA = true;
    }
    deps.receiveStance.actualContactMarker.position.copy(ballPoint);
    deps.receiveStance.actualContactMarker.visible = true;
    const offset = ballPoint.distanceTo(trajectoryGuide);
    const delta = ballPoint.clone().sub(trajectoryGuide);
    const bounceNote = TABLE_TECHNIQUES.has(deps.receiveStance.contactTechnique) ? '接球方落台后、下一跳前。' : '';
    const failureReason = deps.receiveStance.contactFailureReason(ballPoint, trajectoryGuide, session.ball.tableImpacts);
    if (failureReason) {
      session.contactFailed = true;
      deps.receiveStance.setContactGuideState('unreachable');
      (deps.receiveStance.actualContactMarker.material as THREE.MeshBasicMaterial).color.setHex(0xff304f);
      deps.receiveStance.showReceiveFailure(failureReason);
      setTrackingStatus('contact-hold', `接球失败：${failureReason}。红色标记为错过击球窗口时的球位置。`);
    } else {
      deps.receiveStance.setContactGuideState('hittable');
      (deps.receiveStance.actualContactMarker.material as THREE.MeshBasicMaterial).color.setHex(0x35e87b);
      setTrackingStatus(
        'contact-hold',
        `${bounceNote}绿色标记为可处理的实际触球位置，青色标记为建议位置；两者相差 ${Math.round(offset)} mm（高度 ${Math.round(delta.y)} / 横向 ${Math.round(delta.z)} mm）。`,
      );
    }
    return;
  }

  if (hasRequiredBounce && (position.y < 0.08 || velocity.x <= 0 || session.ball.tableImpacts > receiveBounceCount)) {
    session.phase = 'contact-hold';
    session.phaseStartedAt = now;
    session.contactFailed = true;
    deps.receiveStance.setContactGuideState('unreachable');
    session.actualPoint.copy(session.closestPoint);
    deps.receiveStance.actualContactMarker.position.copy(session.closestPoint);
    deps.receiveStance.actualContactMarker.visible = true;
    (deps.receiveStance.actualContactMarker.material as THREE.MeshBasicMaterial).color.setHex(0xff304f);
    const reason = '当前身位无法进入该球的标准击球窗口';
    deps.receiveStance.showReceiveFailure(reason);
    setTrackingStatus('contact-hold', `接球失败：${reason}；红色标记为最接近点。`);
  }
}
//#endregion

//#region 方法/工具
//#endregion
