//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getBalls, isReady, type RapierBall } from '../physics';
import {
  BOUNCE_REQUIRED_TECHNIQUES,
  CONTACT_TECHNIQUES,
  TABLE_TECHNIQUES,
  receivePreparationMs,
} from '../domain/contactRules';
import { restoreQuickViewBase, updateHighArcFraming } from '../highArcFraming';
import { setWindowOpen } from '../ui/windowManager';
import type { IncomingSource, TrackingPhase, TrackingSession } from './trackingTypes';
import type { ReceiveStanceApi } from './receiveStance';
import type { MachineUiApi } from './machineUi';
import type { TrackingReplayApi } from './trackingReplay';

//#endregion

//#region 常量/配置
const SOURCE_TURN_SPEED_DEG_PER_SEC = 180;
//#endregion

//#region 模型/类型
export interface TrackingDemoDeps {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  TABLE_TOP_Y: number;
  BALL_RADIUS: number;
  receiveStance: ReceiveStanceApi;
  machineUiApi: MachineUiApi;
  trackingReplay: TrackingReplayApi;
  clearBalls: () => Promise<void>;
  syncWindowIndicators: () => void;
}

export interface TrackingDemoApi {
  startTrackingDemo: () => Promise<void>;
  stopTrackingDemo: (resetStatus?: boolean) => void;
  updateTrackingDemo: (now: number, deltaSeconds: number) => void;
  feedContinuousTrackingBall: (now: number) => void;
  attachBallToTracking: (ball: RapierBall) => void;
  advanceClocksBy: (pausedMs: number) => void;
  setContinuousChecked: (checked: boolean) => void;
  clearContinuousQueue: () => void;
  resumeContinuousIfActive: () => void;
  updateControlState: () => void;
  isTrackingEnabled: () => boolean;
  isTrackingContinuous: () => boolean;
  hasTrackingSession: () => boolean;
}
//#endregion

//#region 私有成员
let deps!: TrackingDemoDeps;

let trackingStartEl!: HTMLButtonElement;
let trackingContinuousEl!: HTMLInputElement;

let trackingEnabled = false;
let trackingSession: TrackingSession | null = null;
let trackingContinuous = false;
let trackingNextShotAt = 0;
const trackingQueue: RapierBall[] = [];
const trackingTarget = new THREE.Vector3();
const machineLookPoint = new THREE.Vector3();

const incomingSource: IncomingSource = {
  // Future opponent-release tracking can replace this source without
  // changing the camera state machine or contact-point logic.
  kind: 'machine',
  label: '发球机（动态站位）',
  note: '按发球类型调整出手位置、高度与角度',
  position: () => deps.machineUiApi.currentMachineBallOrigin.clone(),
};

function trackingPhaseLabel(phase: TrackingPhase): string {
  if (phase === 'follow-launch') return '跟随来球，寻找最高点';
  if (phase === 'look-back') return '已到最高点，回看发球机';
  if (phase === 'reacquire') return '重新捕捉来球';
  if (phase === 'follow-contact') return '持续跟球至击球点';
  if (phase === 'post-contact-source') return '击球完毕，平滑回看出球点';
  return '击球瞬间已锁定';
}

function setTrackingStatus(phase: TrackingPhase, detail = ''): void {
  const spec = CONTACT_TECHNIQUES[deps.receiveStance.contactTechnique];
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${trackingPhaseLabel(phase)}</strong> · ${spec.label}<br>` +
    `来球源：${incomingSource.label}；${incomingSource.note}` +
    `${detail ? `<br>${detail}` : `<br>${spec.description}`}`;
  deps.receiveStance.updateStanceDisplay();
}

function turnViewAtHumanSpeed(desiredTarget: THREE.Vector3, deltaSeconds: number): void {
  const cameraDistance = Math.max(1, deps.controls.target.distanceTo(deps.camera.position));
  const currentDirection = deps.controls.target.clone().sub(deps.camera.position).normalize();
  const desiredDirection = desiredTarget.clone().sub(deps.camera.position).normalize();
  const maxAngle = THREE.MathUtils.degToRad(SOURCE_TURN_SPEED_DEG_PER_SEC) * deltaSeconds;
  const angle = currentDirection.angleTo(desiredDirection);
  if (angle > maxAngle && angle > 1e-5) {
    const axis = currentDirection.clone().cross(desiredDirection).normalize();
    currentDirection.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, maxAngle));
  } else {
    currentDirection.copy(desiredDirection);
  }
  deps.controls.target.copy(deps.camera.position).addScaledVector(currentDirection, cameraDistance);
}

function updateTrackingControlState(): void {
  trackingStartEl.textContent = trackingEnabled ? '停止跟球' : '开启跟球';
  trackingStartEl.classList.toggle('active', trackingEnabled);
  trackingContinuous = trackingContinuousEl.checked;
  deps.trackingReplay.syncAutoReplayFromCheckbox();
  deps.machineUiApi.updateMachineOperatingStatus();
  deps.syncWindowIndicators();
}
//#endregion

//#region 公开 API
export function initTrackingDemo(trackingDemoDeps: TrackingDemoDeps): TrackingDemoApi {
  deps = trackingDemoDeps;

  trackingStartEl = document.getElementById('tracking-start') as HTMLButtonElement;
  trackingContinuousEl = document.getElementById('tracking-continuous') as HTMLInputElement;

  trackingStartEl.addEventListener('click', () => {
    if (trackingEnabled) {
      stopTrackingDemo();
    } else {
      void startTrackingDemo();
    }
  });
  trackingContinuousEl.addEventListener('change', () => {
    trackingContinuous = trackingContinuousEl.checked;
    if (!trackingContinuous) {
      trackingQueue.length = 0;
    } else if (trackingEnabled && !deps.trackingReplay.isAutoReplayEnabled() && !deps.trackingReplay.isReplayMode()) {
      trackingNextShotAt = performance.now() + 1000 / deps.machineUiApi.readMachineSettings().cadence;
    }
    updateTrackingControlState();
  });
  updateTrackingControlState();

  return {
    startTrackingDemo,
    stopTrackingDemo,
    updateTrackingDemo,
    feedContinuousTrackingBall,
    attachBallToTracking,
    advanceClocksBy,
    setContinuousChecked: (checked: boolean) => { trackingContinuousEl.checked = checked; },
    clearContinuousQueue: () => { trackingQueue.length = 0; },
    resumeContinuousIfActive: () => {
      if (trackingEnabled && trackingContinuous) launchNextTrackingBall(true);
    },
    updateControlState: updateTrackingControlState,
    isTrackingEnabled: () => trackingEnabled,
    isTrackingContinuous: () => trackingContinuous,
    hasTrackingSession: () => trackingSession !== null,
  };
}

function advanceClocksBy(pausedMs: number): void {
  if (trackingEnabled) trackingNextShotAt += pausedMs;
  if (trackingSession) {
    trackingSession.startedAt += pausedMs;
    trackingSession.phaseStartedAt += pausedMs;
    deps.trackingReplay.advanceRecordingClockBy(pausedMs);
  }
}

function stopTrackingDemo(resetStatus = true): void {
  deps.trackingReplay.stopReplay();
  deps.receiveStance.clearReceiveFailureFeedback();
  deps.receiveStance.trackedReceiveBounceX = null;
  deps.receiveStance.setContactGuideState('hittable');
  trackingEnabled = false;
  trackingSession = null;
  trackingQueue.length = 0;
  deps.controls.enabled = true;
  deps.receiveStance.contactGuideMarker.visible = false;
  deps.receiveStance.actualContactMarker.visible = false;
  deps.receiveStance.contactLink.visible = false;
  deps.receiveStance.trackingTrailLine.visible = false;
  deps.receiveStance.trackingTrailLine.geometry.dispose();
  deps.receiveStance.trackingTrailLine.geometry = new THREE.BufferGeometry();
  deps.receiveStance.trackingTrailPoints = [];
  if (deps.receiveStance.hasLockedQuickView()) restoreQuickViewBase(deps.camera, deps.controls);
  if (resetStatus) deps.receiveStance.updateContactGuide(false);
  updateTrackingControlState();
}

function beginTrackingBall(ball: RapierBall, now: number, snapCamera = false, skipSourceGlance = false): void {
  deps.receiveStance.clearReceiveFailureFeedback();
  deps.receiveStance.trackedReceiveBounceX = null;
  deps.trackingReplay.beginRecording(ball, now);
  const velocity = ball.body.linvel();
  const position = ball.body.translation();
  // A receiver watches the server before an opening serve, so there is no
  // artificial "follow the ball, then look back" detour. The selected
  // receiver level controls how quickly the serve is read and reacquired.
  const initialPhase: TrackingPhase = deps.machineUiApi.activePreset.mode === 'serve'
    ? 'reacquire'
    : skipSourceGlance ? 'follow-contact' : 'follow-launch';
  trackingSession = {
    ball,
    phase: initialPhase,
    phaseStartedAt: now,
    startedAt: now,
    previousVy: velocity.y,
    apexPoint: new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000),
    actualPoint: new THREE.Vector3(),
    closestPoint: new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000),
    closestDistance: Number.POSITIVE_INFINITY,
    contactFailed: false,
  };
  const lockedView = deps.receiveStance.hasLockedQuickView();
  deps.controls.enabled = lockedView;
  const initialPosition = new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000);
  deps.receiveStance.trackingTrailPoints = [initialPosition.clone()];
  deps.receiveStance.trackingTrailLine.geometry.dispose();
  deps.receiveStance.trackingTrailLine.geometry = new THREE.BufferGeometry().setFromPoints(deps.receiveStance.trackingTrailPoints);
  deps.receiveStance.trackingTrailLine.visible = true;
  deps.receiveStance.contactGuideMarker.visible = true;
  deps.receiveStance.actualContactMarker.visible = false;
  (deps.receiveStance.actualContactMarker.material as THREE.MeshBasicMaterial).color.setHex(0x35e87b);
  trackingTarget.set(position.x * 1000, position.y * 1000, position.z * 1000);
  // Only the first ball establishes the initial eye target. During continuous
  // tracking, keep the previous contact target and let the normal camera
  // interpolation acquire the next ball without a sudden viewpoint jump.
  // Locked quick views keep their chosen camera and are not snapped onto the ball.
  if (snapCamera && !lockedView) deps.controls.target.copy(trackingTarget);
  const initialGuide = deps.receiveStance.contactGuidePosition();
  const initialFailure = deps.receiveStance.contactFailureReason(initialGuide, initialGuide, deps.receiveStance.requiredReceiveBounceCount(), 1);
  deps.receiveStance.setContactGuideState(initialFailure ? 'unreachable' : 'hittable');
  updateTrackingControlState();
  setTrackingStatus(initialPhase, initialPhase === 'reacquire'
    ? `正在读取发球动作并准备${CONTACT_TECHNIQUES[deps.receiveStance.contactTechnique].label}；${deps.receiveStance.currentReceiverProfile().label}反应约 ${deps.receiveStance.currentReceiverProfile().reactionMs} ms。`
    : '');
}

function launchNextTrackingBall(restoreFollowView = false): void {
  if (!trackingEnabled) return;
  deps.receiveStance.resetAutomaticStance();
  const useFollowCamera = restoreFollowView && !deps.receiveStance.hasLockedQuickView();
  if (useFollowCamera) deps.receiveStance.applyViewPreset();
  deps.receiveStance.updateContactGuide(true);
  const ball = deps.machineUiApi.feedMachine(deps.machineUiApi.activePreset, true);
  if (!ball) {
    stopTrackingDemo();
    return;
  }
  // solveLaunch() is synchronous and can take a noticeable amount of time.
  // The replay clock must start after the ball actually exists, otherwise
  // solver time becomes a fake stationary segment at the beginning.
  const launchedAt = performance.now();
  beginTrackingBall(ball, launchedAt, useFollowCamera, !restoreFollowView);
  trackingNextShotAt = launchedAt + 1000 / deps.machineUiApi.readMachineSettings().cadence;
}

async function startTrackingDemo(): Promise<void> {
  if (!isReady()) return;
  await deps.clearBalls();
  deps.machineUiApi.setMachineRunning(false);
  trackingEnabled = true;
  trackingContinuous = trackingContinuousEl.checked;
  deps.trackingReplay.syncAutoReplayFromCheckbox();
  trackingQueue.length = 0;
  deps.receiveStance.resetAutomaticStance();
  if (!deps.receiveStance.hasLockedQuickView()) deps.receiveStance.applyViewPreset();
  // A tracking demo follows exactly what the machine is configured to throw:
  // no hidden preset, lane, or randomization override. If the selected stance
  // cannot handle that ball, the demo must expose the miss instead of adapting
  // the incoming ball to make the technique look successful.
  launchNextTrackingBall(true);
  updateTrackingControlState();
}

function attachBallToTracking(ball: RapierBall): void {
  // Same tracking state machine as machine presets: launch glance → contact →
  // slow replay through every selected view. The grey no-spin ball is only a baseline.
  stopTrackingDemo(false);
  deps.machineUiApi.setMachineRunning(false);
  trackingEnabled = true;
  trackingContinuous = false;
  trackingContinuousEl.checked = false;
  deps.trackingReplay.enableAutoReplayForDemo();
  trackingQueue.length = 0;
  deps.receiveStance.resetAutomaticStance();
  if (!deps.receiveStance.hasLockedQuickView()) deps.receiveStance.applyViewPreset();
  deps.receiveStance.updateContactGuide(true);
  beginTrackingBall(ball, performance.now(), !deps.receiveStance.hasLockedQuickView(), false);
  setWindowOpen('tracking-window', true);
  updateTrackingControlState();
}

function feedContinuousTrackingBall(now: number): void {
  if (
    !trackingEnabled || !trackingContinuous ||
    deps.trackingReplay.isAutoReplayEnabled() || deps.trackingReplay.isReplayMode() ||
    now < trackingNextShotAt
  ) return;
  const ball = deps.machineUiApi.feedMachine(deps.machineUiApi.activePreset, true);
  if (ball) trackingQueue.push(ball);
  trackingNextShotAt = now + 1000 / deps.machineUiApi.readMachineSettings().cadence;
}
//#endregion

//#region 业务逻辑
function updateTrackingDemo(now: number, deltaSeconds: number): void {
  const session = trackingSession;
  if (!session) return;
  if (!getBalls().includes(session.ball)) {
    stopTrackingDemo();
    return;
  }
  const position = session.ball.body.translation();
  const velocity = session.ball.body.linvel();
  const ballPoint = new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000);
  deps.trackingReplay.recordFrame(now, session.ball);
  const lastTrailPoint = deps.receiveStance.trackingTrailPoints[deps.receiveStance.trackingTrailPoints.length - 1];
  if (!lastTrailPoint || lastTrailPoint.distanceTo(ballPoint) > 18) {
    deps.receiveStance.trackingTrailPoints.push(ballPoint.clone());
    if (deps.receiveStance.trackingTrailPoints.length > 360) deps.receiveStance.trackingTrailPoints.shift();
    deps.receiveStance.trackingTrailLine.geometry.dispose();
    deps.receiveStance.trackingTrailLine.geometry = new THREE.BufferGeometry().setFromPoints(deps.receiveStance.trackingTrailPoints);
  }
  const elapsedInPhase = now - session.phaseStartedAt;
  const visualElapsedInPhase = elapsedInPhase;
  const receiveBounceCount = deps.receiveStance.requiredReceiveBounceCount();
  if (
    TABLE_TECHNIQUES.has(deps.receiveStance.contactTechnique) &&
    session.ball.tableImpacts === receiveBounceCount &&
    session.ball.lastTableImpact
  ) {
    deps.receiveStance.trackedReceiveBounceX = session.ball.lastTableImpact.x * 1000;
  }
  // Footwork can start shortly after the first visual cue, before the eyes
  // have fully reacquired the ball. This avoids treating reaction and movement
  // as two strictly serial delays while preserving a meaningful level gap.
  const receiver = deps.receiveStance.currentReceiverProfile();
  if (now - session.startedAt >= receiver.reactionMs * 0.35) {
    deps.receiveStance.moveAutomaticStanceForBall(ballPoint, velocity, deltaSeconds);
  }
  const guide = deps.receiveStance.contactGuidePosition();
  let trajectoryGuide = guide;
  let secondsToGuide = 0;
  let hasTrajectoryProjection = false;
  // After the legal receive-side bounce, project the contact plane onto the
  // real arc so the cyan marker sits on the post-bounce rise / early descent.
  if (session.ball.tableImpacts >= receiveBounceCount && velocity.x > 0.05 && ballPoint.x < guide.x) {
    const timeToPlane = (guide.x / 1000 - position.x) / velocity.x;
    const projected = new THREE.Vector3(
      guide.x,
      ballPoint.y + velocity.y * 1000 * timeToPlane - 0.5 * 9810 * timeToPlane ** 2,
      ballPoint.z + velocity.z * 1000 * timeToPlane,
    );
    if (timeToPlane > 0 && timeToPlane < 1.5 && projected.y > deps.TABLE_TOP_Y + deps.BALL_RADIUS && projected.y < 2400) {
      trajectoryGuide = projected;
      secondsToGuide = timeToPlane;
      hasTrajectoryProjection = true;
      if (deps.receiveStance.contactGuideMarker.visible) deps.receiveStance.placeContactGuide(projected, true);
    }
  }
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

  if (session.phase === 'follow-launch') {
    trackingTarget.copy(ballPoint);
    const passedApex = session.previousVy > 0 && velocity.y <= 0;
    const launchedDownward = now - session.startedAt > 180 && session.previousVy <= 0 && velocity.y <= session.previousVy;
    if (passedApex || launchedDownward) {
      session.apexPoint.copy(ballPoint);
      session.phase = 'look-back';
      session.phaseStartedAt = now;
      setTrackingStatus('look-back', `最高点约 ${Math.round(ballPoint.y)} mm；短暂确认发球机方向。`);
    }
  } else if (session.phase === 'look-back') {
    machineLookPoint.copy(incomingSource.position());
    trackingTarget.lerp(machineLookPoint, 0.13);
    const sourceGlanceMs = receiver.reactionMs * 0.6;
    if (visualElapsedInPhase > sourceGlanceMs) {
      session.phase = 'reacquire';
      session.phaseStartedAt = now;
      setTrackingStatus('reacquire');
    }
  } else if (session.phase === 'reacquire') {
    trackingTarget.lerp(ballPoint, 0.2);
    const reacquireMs = deps.machineUiApi.activePreset.mode === 'serve'
      ? receiver.reactionMs + receivePreparationMs(deps.receiveStance.contactTechnique)
      : receiver.reactionMs * 0.4;
    if (visualElapsedInPhase > reacquireMs) {
      session.phase = 'follow-contact';
      session.phaseStartedAt = now;
      setTrackingStatus('follow-contact', `青色标记为${CONTACT_TECHNIQUES[deps.receiveStance.contactTechnique].timing}的建议击球点。`);
    }
  } else if (session.phase === 'follow-contact') {
    trackingTarget.copy(ballPoint);
    const hasRequiredBounce =
      !BOUNCE_REQUIRED_TECHNIQUES.has(deps.receiveStance.contactTechnique) ||
      session.ball.tableImpacts >= receiveBounceCount;
    if (position.x * 1000 >= guide.x && hasRequiredBounce) {
      session.phase = 'contact-hold';
      session.phaseStartedAt = now;
      session.actualPoint.copy(ballPoint);
      deps.receiveStance.actualContactMarker.position.copy(ballPoint);
      deps.receiveStance.actualContactMarker.visible = true;
      const offset = ballPoint.distanceTo(trajectoryGuide);
      const delta = ballPoint.clone().sub(guide);
      const bounceNote = TABLE_TECHNIQUES.has(deps.receiveStance.contactTechnique) ? '接球方落台后、下一跳前。' : '';
      const failureReason = deps.receiveStance.contactFailureReason(ballPoint, guide, session.ball.tableImpacts);
      if (failureReason) {
        session.contactFailed = true;
        deps.receiveStance.setContactGuideState('unreachable');
        (deps.receiveStance.actualContactMarker.material as THREE.MeshBasicMaterial).color.setHex(0xff304f);
        deps.receiveStance.showReceiveFailure(failureReason);
        setTrackingStatus('contact-hold', `接球失败：${failureReason}。红色标记为错过击球窗口时的球位置。`);
      } else {
        deps.receiveStance.setContactGuideState('hittable');
        (deps.receiveStance.actualContactMarker.material as THREE.MeshBasicMaterial).color.setHex(0x35e87b);
        setTrackingStatus('contact-hold', `${bounceNote}绿色标记为可处理的实际触球位置，青色标记为建议位置；两者相差 ${Math.round(offset)} mm（高度 ${Math.round(delta.y)} / 横向 ${Math.round(delta.z)} mm）。`);
      }
    } else if (hasRequiredBounce && (position.y < 0.08 || velocity.x <= 0 || session.ball.tableImpacts > receiveBounceCount)) {
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
  } else if (session.phase === 'contact-hold') {
    trackingTarget.copy(session.actualPoint);
    if (elapsedInPhase > 140) {
      session.phase = 'post-contact-source';
      session.phaseStartedAt = now;
      setTrackingStatus('post-contact-source', session.contactFailed
        ? `本球处理失败，视线仍按真实反应回看${incomingSource.label}，再准备下一球。`
        : `击球完成，先回看${incomingSource.label}，再捕捉下一球。`);
    }
  }

  if (session.phase === 'post-contact-source') {
    trackingTarget.copy(incomingSource.position());
    if (elapsedInPhase > 420) {
      if (deps.trackingReplay.isAutoReplayEnabled() && deps.trackingReplay.isRecordingFinalized()) {
        trackingSession = null;
        deps.trackingReplay.startReplay(session.ball);
        return;
      }
      if (trackingContinuous && trackingQueue.length > 0) {
        beginTrackingBall(trackingQueue.shift()!, now, false, true);
        return;
      }
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
    turnViewAtHumanSpeed(trackingTarget, deltaSeconds);
  } else {
    deps.controls.target.lerp(trackingTarget, session.phase === 'contact-hold' ? 0.22 : 0.30);
  }
}
//#endregion

//#region 方法/工具
//#endregion
