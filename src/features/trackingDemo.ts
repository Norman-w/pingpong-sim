//#region 导入/依赖
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isReady, type RapierBall } from '../physics';
import { CONTACT_TECHNIQUES } from '../domain/contactRules';
import { restoreQuickViewBase } from '../highArcFraming';
import { setWindowOpen } from '../ui/windowManager';
import type { IncomingSource, TrackingPhase, TrackingSession } from './trackingTypes';
import type { ReceiveStanceApi } from './receiveStance';
import type { MachineUiApi } from './machineUi';
import type { TrackingReplayApi } from './trackingReplay';
import { createLobSessionFields, initLobWindowTeaching } from './lobWindowTeaching';
import { runTrackingDemoFrame, type TrackingDemoLoopContext } from './trackingDemoLoop';

//#endregion

//#region 常量/配置
const SOURCE_TURN_SPEED_DEG_PER_SEC = 180;
//#endregion

//#region 模型/类型
export interface TrackingDemoDeps {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  TABLE_TOP_Y: number;
  TABLE_LENGTH: number;
  BALL_RADIUS: number;
  receiveStance: ReceiveStanceApi;
  machineUiApi: MachineUiApi;
  trackingReplay: TrackingReplayApi;
  clearBalls: () => Promise<void>;
  syncWindowIndicators: () => void;
  /** Called after a live tracking feed so the render loop does not apply a hitch dt. */
  onLiveBallLaunched?: () => void;
  isDemoActive?: () => boolean;
  exitTopicDemo?: () => void;
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
  /** Feed the next live ball while tracking stays enabled (demo cycles). */
  launchNextLiveDemoBall: () => void;
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

let lobTeaching!: ReturnType<typeof initLobWindowTeaching>;
let loopContext!: TrackingDemoLoopContext;

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
  lobTeaching = initLobWindowTeaching({
    TABLE_TOP_Y: deps.TABLE_TOP_Y,
    TABLE_LENGTH: deps.TABLE_LENGTH,
    BALL_RADIUS: deps.BALL_RADIUS,
    receiveStance: deps.receiveStance,
    camera: deps.camera,
    getReceiverLevel: () => deps.receiveStance.receiverLevel,
    setTrackingStatus,
  });
  loopContext = {
    deps,
    trackingTarget,
    machineLookPoint,
    incomingSource,
    lobTeaching,
    get trackingContinuous() { return trackingContinuous; },
    trackingQueue,
    setTrackingStatus,
    turnViewAtHumanSpeed,
    stopTrackingDemo,
    beginTrackingBall,
    clearTrackingSession: () => { trackingSession = null; },
    launchNextLiveDemoBall: () => { launchNextTrackingBall(true); },
  };

  trackingStartEl = document.getElementById('tracking-start') as HTMLButtonElement;
  trackingContinuousEl = document.getElementById('tracking-continuous') as HTMLInputElement;

  trackingStartEl.addEventListener('click', () => {
    // Leave topic mode without immediately starting a fresh follow run.
    if (deps.isDemoActive?.()) {
      deps.exitTopicDemo?.();
      return;
    }
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
    launchNextLiveDemoBall: () => { launchNextTrackingBall(true); },
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
  // Only wipe the topic playlist when an active tracking run is stopped.
  // startTrackingDemo → clearBalls also calls stop while trackingEnabled is
  // already false; clearing here would erase the plan configured just above.
  const wasTracking = trackingEnabled;
  deps.trackingReplay.stopReplay();
  if (wasTracking) {
    deps.trackingReplay.clearDemoPlaybackPlan();
    deps.machineUiApi.lockTargetDepthMm(null);
  }
  deps.receiveStance.clearReceiveFailureFeedback();
  deps.receiveStance.clearMissedPreferredMarker();
  deps.receiveStance.autoDepthOverrideX = null;
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
  deps.receiveStance.clearMissedPreferredMarker();
  deps.receiveStance.autoDepthOverrideX = null;
  deps.receiveStance.trackedReceiveBounceX = null;
  deps.trackingReplay.beginRecording(ball, now);
  const velocity = ball.body.linvel();
  const position = ball.body.translation();
  // A receiver watches the server before an opening serve, so there is no
  // artificial "follow the ball, then look back" detour. Lob teaching must
  // keep eyes on the ball through bounce → window A/B; a mid-arc look-back
  // reads as gaze thrash and loses the second contact point.
  const isLobPreset = deps.machineUiApi.activePreset.id === 'lob';
  const initialPhase: TrackingPhase = deps.machineUiApi.activePreset.mode === 'serve'
    ? 'reacquire'
    : (skipSourceGlance || isLobPreset) ? 'follow-contact' : 'follow-launch';
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
    ...createLobSessionFields(),
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
  // Reset feet to this ball's opening stance so live + replay both start there.
  deps.receiveStance.resetAutomaticStance(true);
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
  deps.onLiveBallLaunched?.();
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
  runTrackingDemoFrame(loopContext, session, now, deltaSeconds);
}
//#endregion

//#region 方法/工具
//#endregion
