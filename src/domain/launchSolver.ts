//#region 导入/依赖
import {
  PLAYER_LEVELS,
  type LaunchSolution,
  type MachineSettings,
  type PlayerLevel,
  type ShotOutcome,
  type ShotPreset,
  type TargetLane,
} from './shotCatalog';
import {
  BALL_INERTIA,
  BALL_MASS,
  BALL_RADIUS,
  BALL_TABLE_FRICTION,
  NET_X,
  RPM_TO_RAD,
  TABLE_CONTACT_Y,
  advanceSimulation,
  evaluateRally,
  evaluateServe,
  simulateToTarget,
  type SimResult,
  type SimState,
} from './trajectorySim';
//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
interface ServeProfile {
  originXmm: number;
  originZmm: number;
  minNetClearanceMm: number;
  maxNetClearanceMm: number;
}

// Contact point and acceptable net window for each serve family. The machine
// stands behind the server's end line (negative X) and changes lateral stance
// instead of unrealistically releasing every serve from table centre.
const SERVE_PROFILES: Record<string, ServeProfile> = {
  'serve-float-short':     { originXmm: -55, originZmm: -1060, minNetClearanceMm: 24, maxNetClearanceMm: 115 },
  'serve-back-short':      { originXmm: -65, originZmm: -1080, minNetClearanceMm: 22, maxNetClearanceMm: 105 },
  'serve-side-back':       { originXmm: -70, originZmm: -1110, minNetClearanceMm: 22, maxNetClearanceMm: 110 },
  'serve-side-top':        { originXmm: -70, originZmm: -1080, minNetClearanceMm: 20, maxNetClearanceMm: 100 },
  'serve-reverse':         { originXmm: -65, originZmm: -1060, minNetClearanceMm: 22, maxNetClearanceMm: 110 },
  'serve-fast-long':       { originXmm: -105, originZmm: -1160, minNetClearanceMm: 16, maxNetClearanceMm: 65 },
  'serve-pendulum-top':    { originXmm: -70, originZmm: -1080, minNetClearanceMm: 20, maxNetClearanceMm: 95 },
  'serve-reverse-top':     { originXmm: -65, originZmm: -1040, minNetClearanceMm: 20, maxNetClearanceMm: 95 },
  'serve-tomahawk-back':   { originXmm: -60, originZmm: -360,  minNetClearanceMm: 22, maxNetClearanceMm: 110 },
  'serve-tomahawk-top':    { originXmm: -60, originZmm: -380,  minNetClearanceMm: 20, maxNetClearanceMm: 100 },
  'serve-hook-back':       { originXmm: -70, originZmm: -1120, minNetClearanceMm: 22, maxNetClearanceMm: 110 },
  'serve-high-toss-back':  { originXmm: -75, originZmm: -1080, minNetClearanceMm: 24, maxNetClearanceMm: 120 },
  'serve-backhand-side':   { originXmm: -80, originZmm: -1180, minNetClearanceMm: 22, maxNetClearanceMm: 110 },
  'serve-shovel-back':     { originXmm: -65, originZmm: -1040, minNetClearanceMm: 22, maxNetClearanceMm: 110 },
  'serve-ghost':           { originXmm: -65, originZmm: -1040, minNetClearanceMm: 26, maxNetClearanceMm: 125 },
  'serve-punch-float':     { originXmm: -110, originZmm: -1180, minNetClearanceMm: 15, maxNetClearanceMm: 60 },
  'serve-kicker':          { originXmm: -75, originZmm: -1080, minNetClearanceMm: 18, maxNetClearanceMm: 90 },
};

const laneZ: Record<Exclude<TargetLane, 'random'>, number> = {
  // The receiver is at +X and faces -X: a right-handed forehand is on -Z.
  forehand: -1.275,
  middle: -0.7625,
  backhand: -0.25,
};

function rallySourcePosition(preset: ShotPreset): { x: number; z: number } {
  const far = ['chop', 'back-heavy', 'back-extreme', 'long-pips-chop'].includes(preset.id);
  const mid = ['loop-spin', 'loop-fast', 'top-extreme', 'smash'].includes(preset.id);
  const close = ['float-short', 'push', 'back-light', 'long-pips-chop-block', 'anti-dead-block'].includes(preset.id);
  const x = preset.id === 'lob' ? -0.85 : far ? -0.35 : mid ? -0.22 : close ? 0.02 : -0.10;

  let z = -0.7625;
  if (['drive', 'top-drive', 'loop-spin', 'loop-fast', 'smash', 'chop', 'back-heavy', 'top-extreme', 'back-extreme'].includes(preset.id)) {
    z = -1.00;
  } else if (['short-pips-hit', 'short-pips-block', 'medium-pips-sink', 'long-pips-chop-block', 'anti-dead-block'].includes(preset.id)) {
    z = -0.43;
  } else if (preset.id.includes('right')) {
    z = -0.40;
  } else if (preset.id.includes('left')) {
    z = -1.12;
  }
  return { x, z };
}
function centeredNoise(random: () => number): number {
  // Triangular rather than uniform noise: most strokes stay near the selected
  // quality, while the level-specific tails still produce visible mistakes.
  return random() + random() - 1;
}

function rallyClearanceMm(preset: ShotPreset, level: PlayerLevel): number {
  const byLevel = (beginner: number, club: number, advanced: number, world: number): number =>
    ({ beginner, club, advanced, world })[level];
  if (preset.id === 'lob') return byLevel(390, 370, 350, 330);
  if (['chop', 'back-heavy', 'back-extreme', 'long-pips-chop'].includes(preset.id)) {
    return byLevel(250, 220, 190, 165);
  }
  if (['drive', 'top-drive', 'short-pips-hit', 'short-pips-block', 'medium-pips-sink', 'smash'].includes(preset.id)) {
    return byLevel(115, 82, 55, 35);
  }
  if (preset.id === 'loop-fast') return byLevel(155, 120, 88, 62);
  if (preset.id === 'loop-spin' || preset.id === 'top-extreme') return byLevel(210, 170, 130, 95);
  return byLevel(165, 128, 95, 70);
}

function rallyDepthBiasMm(level: PlayerLevel): number {
  return ({ beginner: -160, club: -80, advanced: 0, world: 25 })[level];
}

function serveOriginHeightBiasMm(level: PlayerLevel): number {
  return ({ beginner: 35, club: 15, advanced: 0, world: -10 })[level];
}

function serveClearanceMm(profile: ServeProfile, level: PlayerLevel): number {
  const extra = ({ beginner: 42, club: 27, advanced: 15, world: 7 })[level];
  return Math.min(profile.maxNetClearanceMm - 3, profile.minNetClearanceMm + extra);
}

type UncalibratedLaunch = Omit<LaunchSolution, 'quality'>;

function finalizeLaunch(
  base: UncalibratedLaunch,
  preset: ShotPreset,
  settings: MachineSettings,
  intendedTarget: { x: number; z: number },
): LaunchSolution {
  const level = PLAYER_LEVELS[settings.playerLevel] ?? PLAYER_LEVELS.advanced;
  const random = settings.random ?? Math.random;
  const velocity = {
    x: base.velocityMm.x / 1000,
    y: base.velocityMm.y / 1000,
    z: base.velocityMm.z / 1000,
  };
  const angularVelocity = { ...base.angularVelocity };
  if (settings.randomize) {
    const forcedMistake = random() < level.missRate;
    const mistakeBoost = forcedMistake ? 3.2 : 1;
    velocity.x *= 1 + centeredNoise(random) * level.speedVariation * mistakeBoost;
    velocity.y += centeredNoise(random) * level.executionNoiseMps * mistakeBoost;
    velocity.z += centeredNoise(random) * level.executionNoiseMps * mistakeBoost;
    if (forcedMistake) {
      // Rare non-forced errors need to leave the playable envelope, not just
      // look like another ordinary scatter sample. A lateral timing/contact
      // error is used because it produces a clear wide serve/return while
      // preserving the selected stroke's basic speed and spin identity.
      const direction = random() < 0.5 ? -1 : 1;
      velocity.z += direction * (preset.mode === 'serve' ? 1.45 : 2.8);
      velocity.y += (random() < 0.45 ? -1 : 1) * level.executionNoiseMps * 1.4;
    }
    const spinFactor = Math.max(0.55, 1 + centeredNoise(random) * level.spinVariation * mistakeBoost);
    angularVelocity.x *= spinFactor;
    angularVelocity.y *= spinFactor;
    angularVelocity.z *= spinFactor;
  }

  const origin = {
    x: base.originMm.x / 1000,
    y: base.originMm.y / 1000,
    z: base.originMm.z / 1000,
    vx: velocity.x,
    vy: velocity.y,
    vz: velocity.z,
  };
  let outcome: ShotOutcome = 'in';
  let actualLanding: { x: number; z: number } | undefined;
  let netY = base.netClearanceMm / 1000 + 0.937;
  let serveImpactsMm = base.serveImpactsMm;
  if (preset.mode === 'serve') {
    const result = evaluateServe(origin, angularVelocity);
    netY = result.netY;
    if (result.first && result.second) {
      actualLanding = { x: result.second.x, z: result.second.z };
      serveImpactsMm = {
        first: { x: result.first.x * 1000, z: result.first.z * 1000, timeMs: result.first.time * 1000 },
        second: { x: result.second.x * 1000, z: result.second.z * 1000, timeMs: result.second.time * 1000 },
      };
    } else {
      outcome = 'serve-fault';
      serveImpactsMm = undefined;
    }
  } else {
    const result = evaluateRally(origin, angularVelocity);
    netY = result.netY;
    actualLanding = result.impact;
    if ((netY - 0.937) * 1000 < 20) outcome = 'net';
    else if (!actualLanding || actualLanding.x > 2.72) outcome = 'long';
    else if (actualLanding.z < -1.505 || actualLanding.z > -0.02) outcome = 'wide';
  }

  const nominalRally = preset.mode === 'serve' ? undefined : evaluateRally({
    x: base.originMm.x / 1000,
    y: base.originMm.y / 1000,
    z: base.originMm.z / 1000,
    vx: base.velocityMm.x / 1000,
    vy: base.velocityMm.y / 1000,
    vz: base.velocityMm.z / 1000,
  }, base.angularVelocity);
  const baselineLanding = preset.mode === 'serve' && base.serveImpactsMm
    ? { x: base.serveImpactsMm.second.x / 1000, z: base.serveImpactsMm.second.z / 1000 }
    : nominalRally?.impact ?? intendedTarget;
  const landingErrorMm = actualLanding
    ? Math.hypot(actualLanding.x - baselineLanding.x, actualLanding.z - baselineLanding.z) * 1000
    : undefined;
  return {
    ...base,
    velocityMm: { x: velocity.x * 1000, y: velocity.y * 1000, z: velocity.z * 1000 },
    angularVelocity,
    targetMm: actualLanding
      ? { x: actualLanding.x * 1000, y: TABLE_CONTACT_Y * 1000, z: actualLanding.z * 1000 }
      : base.targetMm,
    speedMps: Math.hypot(velocity.x, velocity.y, velocity.z),
    spinRpm: Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z) / RPM_TO_RAD,
    netClearanceMm: (netY - 0.937) * 1000,
    serveImpactsMm,
    quality: {
      outcome,
      intendedTargetMm: { x: intendedTarget.x * 1000, z: intendedTarget.z * 1000 },
      actualLandingMm: actualLanding ? { x: actualLanding.x * 1000, z: actualLanding.z * 1000 } : undefined,
      landingErrorMm,
      expectedSpreadMm: preset.spreadMm * level.accuracyScale,
      missRate: level.missRate,
    },
  };
}

function randomTargetZ(settings: MachineSettings, spreadMm: number, accuracyScale: number, random: () => number): number {
  const base = settings.targetLane === 'random'
    ? -0.18 - random() * 1.165
    : laneZ[settings.targetLane];
  const spread = settings.randomize ? centeredNoise(random) * spreadMm * accuracyScale / 1000 : 0;
  return Math.max(-1.45, Math.min(-0.075, base + spread));
}

export function solveLaunch(
  preset: ShotPreset,
  settings: MachineSettings,
): LaunchSolution {
  const strength = Math.max(0.6, Math.min(1.4, settings.strength));
  const level = PLAYER_LEVELS[settings.playerLevel] ?? PLAYER_LEVELS.advanced;
  const random = settings.random ?? Math.random;
  const speed = preset.speedMps * strength * level.speedScale;
  const spinScale = (0.75 + 0.25 * strength) * level.spinScale;
  const angularVelocity = {
    x: preset.corkRpm * spinScale * RPM_TO_RAD,
    y: preset.sideRpm * spinScale * RPM_TO_RAD,
    z: -preset.topRpm * spinScale * RPM_TO_RAD,
  };
  let targetX = settings.targetDepthOverrideMm != null
    ? settings.targetDepthOverrideMm / 1000
    : (preset.targetDepthMm + (preset.mode === 'serve' ? 0 : rallyDepthBiasMm(settings.playerLevel))) / 1000 +
      (settings.randomize ? centeredNoise(random) * preset.spreadMm * level.accuracyScale / 1000 : 0);
  let targetZ = randomTargetZ(settings, preset.spreadMm, level.accuracyScale, random);
  // Keep lob landings in a band that usually carries the next bounce off the table
  // while still offering near-net vs deeper variety for teaching.
  if (preset.id === 'lob') {
    targetX = Math.max(1.86, Math.min(2.30, targetX));
  }
  if (preset.mode === 'serve') {
    // A legal table-tennis serve first descends onto the server's half, then
    // clears the net after the bounce and lands on the receiver's half.
    // These launch values are calibrated to that two-bounce geometry; spin
    // and the explicit table-contact impulse create the selected kick.
    const profile = SERVE_PROFILES[preset.id] ?? {
      originXmm: -60, originZmm: -762.5, minNetClearanceMm: 22, maxNetClearanceMm: 115,
    };
    targetX = Math.max(NET_X + 0.12, Math.min(2.65, targetX));
    targetZ = Math.max(-1.43, Math.min(-0.095, targetZ));
    const originX = profile.originXmm / 1000;
    const fastServe = preset.id === 'serve-fast-long' || preset.id === 'serve-punch-float';
    if (fastServe) {
      targetX += ({ beginner: -0.22, club: -0.10, advanced: 0, world: 0.02 })[settings.playerLevel];
    }
    const originY = (preset.launchHeightMm + serveOriginHeightBiasMm(settings.playerLevel)) / 1000;
    const originZ = profile.originZmm / 1000;
    const preferredVx = Math.max(3.8, Math.min(11.2, speed));
    const desiredClearanceMm = serveClearanceMm(profile, settings.playerLevel);
    const fastFirstBounceBias = fastServe
      ? ({ beginner: 140, club: 70, advanced: 0, world: -15 })[settings.playerLevel]
      : 0;
    const firstTargetX = ((preset.firstBounceMm ?? 720) + fastFirstBounceBias) / 1000;
    const firstTargetRatio = Math.max(0, Math.min(1, (firstTargetX - originX) / (targetX - originX)));
    const firstTargetZ = originZ + (targetZ - originZ) * firstTargetRatio;
    let vy = -2.2;
    let vx = preferredVx;
    let vz = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    const scoreOutcome = (
      outcome: ReturnType<typeof evaluateServe>,
      candidateVx: number,
    ): number => {
      if (!outcome.first || !outcome.second) return 500;
      const netClearanceMm = (outcome.netY - 0.937) * 1000;
      let score = Math.abs(outcome.first.x - firstTargetX) * 4.2;
      score += Math.abs(outcome.second.x - targetX) * 5.0;
      score += Math.abs(outcome.first.z - firstTargetZ) * 1.2;
      score += Math.abs(outcome.second.z - targetZ) * 4.5;
      if (outcome.first.x >= NET_X - 0.02) score += 200;
      if (outcome.second.x <= NET_X + 0.02 || outcome.second.x >= 2.70) score += 200;
      if (outcome.first.z < -1.47 || outcome.first.z > -0.055) score += 200;
      if (outcome.second.z < -1.45 || outcome.second.z > -0.075) score += 200;
      if (netClearanceMm < profile.minNetClearanceMm) {
        score += (profile.minNetClearanceMm - netClearanceMm) * 0.22 + 100;
      }
      if (netClearanceMm > profile.maxNetClearanceMm) {
        score += (netClearanceMm - profile.maxNetClearanceMm) * 0.035;
      }
      score += Math.abs(netClearanceMm - desiredClearanceMm) * 0.018;
      // For near-end-line first bounces, favour the shortest contact-to-table
      // interval that still satisfies the complete two-bounce route.
      if (firstTargetX < 0.45) score += outcome.first.time * 0.9;
      score += Math.abs(candidateVx - preferredVx) * 0.18;
      return score;
    };

    for (let speedStep = -14; speedStep <= 14; speedStep += 1) {
      const candidateVx = Math.max(3.5, Math.min(11.6, preferredVx + speedStep * 0.15));
      const travel = Math.max(0.32, (targetX - originX) / candidateVx);
      const candidateVz = (targetZ - originZ) / travel;
      for (let i = 0; i <= 70; i += 1) {
        const candidateVy = -0.65 - i * 0.055;
        const outcome = evaluateServe(
          { x: originX, y: originY, z: originZ, vx: candidateVx, vy: candidateVy, vz: candidateVz },
          angularVelocity,
        );
        const score = scoreOutcome(outcome, candidateVx);
        if (score < bestScore) {
          bestScore = score; vx = candidateVx; vy = candidateVy; vz = candidateVz;
        }
      }
    }

    // Side-spin bends between launch and the second bounce. Correct the
    // lateral launch component against the simulated second impact instead of
    // assuming a straight line from source to target.
    for (let correction = 0; correction < 4; correction += 1) {
      const current = evaluateServe(
        { x: originX, y: originY, z: originZ, vx, vy, vz }, angularVelocity,
      );
      if (!current.second) break;
      const correctedVz = vz + (targetZ - current.second.z) / Math.max(current.second.time, 0.2) * 0.82;
      const corrected = evaluateServe(
        { x: originX, y: originY, z: originZ, vx, vy, vz: correctedVz }, angularVelocity,
      );
      const correctedScore = scoreOutcome(corrected, vx);
      if (correctedScore >= bestScore) break;
      vz = correctedVz;
      bestScore = correctedScore;
    }

    // Re-balance forward speed and vertical angle after lateral correction.
    // This is important for strong side-spin serves aimed diagonally across
    // the table: changing Vz also changes Magnus lift and therefore depth.
    const refinedBaseVx = vx;
    const refinedBaseVy = vy;
    const refinedBaseVz = vz;
    for (let speedStep = -10; speedStep <= 10; speedStep += 1) {
      const candidateVx = Math.max(3.5, Math.min(11.6, refinedBaseVx + speedStep * 0.16));
      const candidateVz = refinedBaseVz * candidateVx / Math.max(refinedBaseVx, 0.1);
      for (let verticalStep = -10; verticalStep <= 10; verticalStep += 1) {
        const candidateVy = refinedBaseVy + verticalStep * 0.09;
        const outcome = evaluateServe(
          { x: originX, y: originY, z: originZ, vx: candidateVx, vy: candidateVy, vz: candidateVz },
          angularVelocity,
        );
        const score = scoreOutcome(outcome, candidateVx);
        if (score < bestScore) {
          bestScore = score;
          vx = candidateVx;
          vy = candidateVy;
          vz = candidateVz;
        }
      }
    }

    for (let correction = 0; correction < 2; correction += 1) {
      const current = evaluateServe(
        { x: originX, y: originY, z: originZ, vx, vy, vz }, angularVelocity,
      );
      if (!current.second) break;
      const correctedVz = vz + (targetZ - current.second.z) / Math.max(current.second.time, 0.2) * 0.7;
      const corrected = evaluateServe(
        { x: originX, y: originY, z: originZ, vx, vy, vz: correctedVz }, angularVelocity,
      );
      const correctedScore = scoreOutcome(corrected, vx);
      if (correctedScore >= bestScore) break;
      vz = correctedVz;
      bestScore = correctedScore;
    }

    const predicted = evaluateServe(
      { x: originX, y: originY, z: originZ, vx, vy, vz }, angularVelocity,
    );
    return finalizeLaunch({
      originMm: { x: originX * 1000, y: originY * 1000, z: originZ * 1000 },
      velocityMm: { x: vx * 1000, y: vy * 1000, z: vz * 1000 },
      angularVelocity,
      targetMm: { x: targetX * 1000, y: TABLE_CONTACT_Y * 1000, z: targetZ * 1000 },
      speedMps: Math.hypot(vx, vy, vz),
      spinRpm: Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm) * spinScale,
      netClearanceMm: (predicted.netY - 0.937) * 1000,
      serveImpactsMm: predicted.first && predicted.second ? {
        first: { x: predicted.first.x * 1000, z: predicted.first.z * 1000, timeMs: predicted.first.time * 1000 },
        second: { x: predicted.second.x * 1000, z: predicted.second.z * 1000, timeMs: predicted.second.time * 1000 },
      } : undefined,
    }, preset, settings, { x: targetX, z: targetZ });
  }
  let originY = preset.launchHeightMm / 1000;
  const source = rallySourcePosition(preset);
  const stanceNoise = settings.randomize ? centeredNoise(random) * 0.025 * level.accuracyScale : 0;
  const originX = source.x - Math.abs(stanceNoise) * 0.45;
  const originZ = Math.max(-1.38, Math.min(-0.145, source.z + stanceNoise));
  let vz = (targetZ - originZ) * speed / Math.max(1, targetX - originX);
  let bestVy = 0;
  let result!: SimResult;

  const desiredNetY = 0.937 + rallyClearanceMm(preset, settings.playerLevel) / 1000;
  // Iteratively compensate aerodynamic drift while also moving the contact
  // height toward the level- and stroke-specific net window. This prevents a
  // generic high safety arc from being imposed on every attacking stroke.
  for (let clearanceAttempt = 0; clearanceAttempt < 6; clearanceAttempt += 1) {
    for (let lateralAttempt = 0; lateralAttempt < 5; lateralAttempt += 1) {
      const vx = Math.sqrt(Math.max(1, speed * speed - vz * vz));
      let low = -6;
      let high = 9;
      for (let i = 0; i < 28; i += 1) {
        const vy = (low + high) / 2;
        const sample = simulateToTarget(
          { x: originX, y: originY, z: originZ, vx, vy, vz },
          angularVelocity,
          targetX,
        );
        if (sample.state.y < TABLE_CONTACT_Y) low = vy;
        else high = vy;
      }
      bestVy = (low + high) / 2;
      result = simulateToTarget(
        { x: originX, y: originY, z: originZ, vx, vy: bestVy, vz },
        angularVelocity,
        targetX,
      );
      vz += (targetZ - result.state.z) / Math.max(result.time, 0.1) * 0.85;
    }
    const clearanceError = desiredNetY - result.netY;
    if (Math.abs(clearanceError) < 0.004) break;
    originY = Math.max(0.90, Math.min(1.75, originY + clearanceError));
  }

  const vx = Math.sqrt(Math.max(1, speed * speed - vz * vz));
  result = simulateToTarget(
    { x: originX, y: originY, z: originZ, vx, vy: bestVy, vz },
    angularVelocity,
    targetX,
  );

  return finalizeLaunch({
    originMm: { x: originX * 1000, y: originY * 1000, z: originZ * 1000 },
    velocityMm: { x: vx * 1000, y: bestVy * 1000, z: vz * 1000 },
    angularVelocity,
    targetMm: { x: targetX * 1000, y: TABLE_CONTACT_Y * 1000, z: targetZ * 1000 },
    speedMps: Math.hypot(vx, bestVy, vz),
    spinRpm: Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm) * spinScale,
    netClearanceMm: (result.netY - 0.937) * 1000,
  }, preset, settings, { x: targetX, z: targetZ });
}

//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
