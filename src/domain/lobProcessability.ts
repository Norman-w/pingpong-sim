//#region 导入/依赖
// Domain helpers for post-bounce lob windows (A = early-rise smash, B = late fall).
// Anthropometry constants are teaching approximations (eye≈0.93·stature, etc.).
//#endregion

//#region 常量/配置
/** ITTF net height above the playing surface (mm). */
export const NET_HEIGHT_MM = 152.5;
/** Eye height ≈ 93% of stature. */
const EYE_TO_STATURE = 0.93;
/** Shoulder-to-fingertip ≈ 44% stature; use ~36% as forward horizontal arm reach. */
const ARM_FORWARD_FRAC = 0.36;
/** Torso lean horizontal contribution ≈ 6% stature. */
const TORSO_LEAN_FRAC = 0.06;
/** Effective racket forward extension to the contact patch (mm). */
const RACKET_EXTENSION_MM = 160;
/** Max forward step-in as a fraction of stature (scaled by level). */
const STEP_IN_FRAC = 0.14;
/** Half-angle base from shoulder/reach geometry (radians). */
const FAN_HALF_ANGLE_BASE = 0.72;
const GRAVITY_MPS2 = 9.81;
//#endregion

//#region 模型/类型
export interface Vec3Mm {
  x: number;
  y: number;
  z: number;
}

export interface StanceXZ {
  x: number;
  z: number;
}

export interface ReceiverCapability {
  moveSpeedMmPerSec: number;
  reachAllowanceMm: number;
  reactionMs: number;
  /** 0..1 — how deep a forward step into the table is allowed. */
  stepInDepthScale: number;
  /** Extra vertical reach from a jump (mm). */
  jumpGainMm: number;
}

export interface ReceiverReachModel {
  heightMm: number;
  standingContactYMm: number;
  jumpContactYMm: number;
  fanRadiusMm: number;
  fanHalfAngleRad: number;
  moveSpeedMmPerSec: number;
  reachAllowanceMm: number;
  reactionMs: number;
}

export type WindowAEndReason = 'apex' | 'unreachable';
//#endregion

//#region 私有成员
function hypot2(dx: number, dz: number): number {
  return Math.hypot(dx, dz);
}
//#endregion

//#region 公开 API
export function tableTopNetYMm(tableTopYMm: number): number {
  return tableTopYMm + NET_HEIGHT_MM;
}

export function capabilityForLevel(level: 'beginner' | 'club' | 'advanced' | 'world'): Pick<
  ReceiverCapability,
  'stepInDepthScale' | 'jumpGainMm'
> {
  if (level === 'beginner') return { stepInDepthScale: 0.32, jumpGainMm: 35 };
  if (level === 'club') return { stepInDepthScale: 0.55, jumpGainMm: 120 };
  if (level === 'advanced') return { stepInDepthScale: 0.75, jumpGainMm: 200 };
  return { stepInDepthScale: 0.92, jumpGainMm: 280 };
}

/**
 * Derive reach fan + vertical envelope from eye height (stature proxy) and
 * level capability. Same equations for children and adults.
 */
export function buildReceiverReachModel(
  eyeHeightMm: number,
  capability: ReceiverCapability,
): ReceiverReachModel {
  const heightMm = eyeHeightMm / EYE_TO_STATURE;
  const armForwardMm = heightMm * ARM_FORWARD_FRAC;
  const leanMm = heightMm * TORSO_LEAN_FRAC;
  const stepInMm = heightMm * STEP_IN_FRAC * capability.stepInDepthScale;
  const fanRadiusMm = armForwardMm + RACKET_EXTENSION_MM + leanMm + stepInMm;
  const fanHalfAngleRad = FAN_HALF_ANGLE_BASE * (0.85 + 0.15 * Math.min(1.25, heightMm / 1700));
  const standingContactYMm = eyeHeightMm + heightMm * 0.04;
  const jumpContactYMm = standingContactYMm + capability.jumpGainMm;
  return {
    heightMm,
    standingContactYMm,
    jumpContactYMm,
    fanRadiusMm,
    fanHalfAngleRad,
    moveSpeedMmPerSec: capability.moveSpeedMmPerSec,
    reachAllowanceMm: capability.reachAllowanceMm,
    reactionMs: capability.reactionMs,
  };
}

/** Table-inward fan rooted at stance: depth along −X (toward opponent), lateral Z. */
export function pointInTableReachFan(
  stance: StanceXZ,
  ball: Vec3Mm,
  model: ReceiverReachModel,
): boolean {
  const towardTableX = stance.x - ball.x;
  const lateralZ = ball.z - stance.z;
  if (towardTableX < -40) return false;
  const depth = Math.max(0, towardTableX);
  const range = hypot2(depth, lateralZ);
  if (range > model.fanRadiusMm + 1) return false;
  if (depth < 1) return Math.abs(lateralZ) <= model.fanRadiusMm * Math.sin(model.fanHalfAngleRad);
  const angle = Math.atan2(Math.abs(lateralZ), depth);
  return angle <= model.fanHalfAngleRad + 1e-3;
}

export function canReachContact(args: {
  stance: StanceXZ;
  stanceFootX: number;
  stanceFootZ: number;
  ball: Vec3Mm;
  model: ReceiverReachModel;
  remainingSeconds: number;
  allowJump: boolean;
  autoFootwork: boolean;
}): boolean {
  const { stance, stanceFootX, stanceFootZ, ball, model, remainingSeconds, allowJump, autoFootwork } = args;
  const maxY = allowJump ? model.jumpContactYMm : model.standingContactYMm;
  if (ball.y > maxY + 8) return false;
  const fanOrigin = autoFootwork ? stance : { x: stanceFootX, z: stanceFootZ };
  if (!pointInTableReachFan(fanOrigin, ball, model)) return false;
  if (!autoFootwork) return true;
  const travel = hypot2(stance.x - stanceFootX, stance.z - stanceFootZ);
  const budget = Math.max(0, remainingSeconds) * model.moveSpeedMmPerSec + model.reachAllowanceMm;
  return travel <= budget + 1;
}

export function isInWindowARise(args: {
  bounced: boolean;
  ballYMm: number;
  velocityYMps: number;
  tableTopYMm: number;
}): boolean {
  if (!args.bounced) return false;
  if (args.velocityYMps <= 0) return false;
  return args.ballYMm >= tableTopNetYMm(args.tableTopYMm);
}

export function secondsToApex(velocityYMps: number): number {
  if (velocityYMps <= 0) return 0;
  return velocityYMps / GRAVITY_MPS2;
}

export function detectWindowAEnd(args: {
  previousVyMps: number;
  velocityYMps: number;
  ball: Vec3Mm;
  model: ReceiverReachModel;
  enteredWindowA: boolean;
  canReachPreferredBeforeApex: boolean;
  elapsedInWindowASec: number;
}): WindowAEndReason | null {
  if (!args.enteredWindowA) return null;
  if (args.previousVyMps > 0 && args.velocityYMps <= 0) return 'apex';
  if (args.velocityYMps > 0 && args.ball.y > args.model.jumpContactYMm) return 'unreachable';
  const reacted = args.elapsedInWindowASec >= args.model.reactionMs * 0.001 * 0.45;
  if (args.velocityYMps > 0 && reacted && !args.canReachPreferredBeforeApex) return 'unreachable';
  return null;
}

export function ballisticSampleAt(
  ball: Vec3Mm,
  velocityMps: Vec3Mm,
  timeSec: number,
): Vec3Mm {
  return {
    x: ball.x + velocityMps.x * 1000 * timeSec,
    y: ball.y + velocityMps.y * 1000 * timeSec - 0.5 * GRAVITY_MPS2 * 1000 * timeSec * timeSec,
    z: ball.z + velocityMps.z * 1000 * timeSec,
  };
}

/**
 * Feet stay behind the live/predicted contact by a forehand forward reach so
 * the ball stays in front while depth tracks near→far with the arc.
 */
export function retreatStanceForContact(
  contact: Vec3Mm,
  tableEndXMm: number,
  maxStanceXMm: number,
  forwardReachMm = 560,
): StanceXZ {
  const reachDepthMm = Math.min(640, Math.max(420, forwardReachMm));
  const behindBall = contact.x + reachDepthMm;
  return {
    x: Math.min(maxStanceXMm, Math.max(tableEndXMm * 0.5, behindBall)),
    z: contact.z,
  };
}

/**
 * First descending crossing of standing processable height after the receive bounce.
 * Used to relocate the cyan guide to window B after missing window A.
 */
export function pickWindowBContactOnArc(args: {
  ball: Vec3Mm;
  velocityMps: Vec3Mm;
  model: ReceiverReachModel;
  ballRadiusMm: number;
  postBounceApexSeen: boolean;
}): Vec3Mm | null {
  const processableY = args.model.standingContactYMm;
  const groundY = args.ballRadiusMm + 30;
  if (
    args.postBounceApexSeen &&
    args.velocityMps.y < 0 &&
    args.ball.y <= processableY + 8 &&
    args.ball.y > groundY
  ) {
    return { ...args.ball };
  }

  let previousY = args.ball.y;
  let sawApex = args.postBounceApexSeen || args.velocityMps.y <= 0;
  for (let t = 0.015; t <= 2.2; t += 0.015) {
    const sample = ballisticSampleAt(args.ball, args.velocityMps, t);
    if (sample.y <= groundY) break;
    const vyMm = args.velocityMps.y * 1000 - GRAVITY_MPS2 * 1000 * t;
    if (!sawApex) {
      if (vyMm <= 0) sawApex = true;
      previousY = sample.y;
      continue;
    }
    if (vyMm > 0) {
      previousY = sample.y;
      continue;
    }
    if (previousY > processableY && sample.y <= processableY) return sample;
    previousY = sample.y;
  }
  return null;
}
//#endregion
