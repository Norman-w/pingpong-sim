export type ShotCategory = '开局发球' | '基础球' | '上旋进攻' | '下旋控制' | '侧旋组合' | '极限球';
export type TargetLane = 'random' | 'forehand' | 'middle' | 'backhand';
export type PlayerLevel = 'beginner' | 'club' | 'advanced' | 'world';
export type BallStyle = 'white' | 'yellow' | 'white-yellow-split' | 'white-yellow-eight' | 'rainbow';

export const PLAYER_LEVELS: Record<PlayerLevel, {
  label: string; speedScale: number; spinScale: number; reference: string;
}> = {
  beginner: { label: '业余入门', speedScale: 0.72, spinScale: 0.48, reference: '动作建立期：重控制，速度与旋转均保守。' },
  club: { label: '业余俱乐部', speedScale: 0.88, spinScale: 0.72, reference: '稳定对练与比赛常见强度。' },
  advanced: { label: '专业训练', speedScale: 1, spinScale: 1, reference: '以系统训练球速/转速为预设基准。' },
  world: { label: '世界级参考', speedScale: 1.16, spinScale: 1.24, reference: '高水平上限参考；并非每一球都达到极限。' },
};

export interface ShotPreset {
  id: string;
  name: string;
  category: ShotCategory;
  description: string;
  speedMps: number;
  topRpm: number;
  sideRpm: number;
  corkRpm: number;
  targetDepthMm: number;
  launchHeightMm: number;
  cadence: number;
  spreadMm: number;
  color: number;
  shortcut?: string;
  mode?: 'rally' | 'serve';
  firstBounceMm?: number;
}

export interface MachineSettings {
  strength: number;
  cadence: number;
  targetLane: TargetLane;
  randomize: boolean;
  playerLevel: PlayerLevel;
}

export interface LaunchSolution {
  originMm: { x: number; y: number; z: number };
  velocityMm: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
  targetMm: { x: number; y: number; z: number };
  speedMps: number;
  spinRpm: number;
  netClearanceMm: number;
}

const orange = 0xff9f43;
const red = 0xff5d73;
const blue = 0x54a0ff;
const purple = 0xa66cff;
const gold = 0xffd166;

export const SHOT_PRESETS: readonly ShotPreset[] = [
  { id: 'serve-float-short', name: '无旋短发球', category: '开局发球', mode: 'serve', description: '本方近网先落台，过网后在对方近网区二跳。', speedMps: 4.8, topRpm: 0, sideRpm: 0, corkRpm: 0, firstBounceMm: 720, targetDepthMm: 1740, launchHeightMm: 1050, cadence: 0.8, spreadMm: 30, color: orange },
  { id: 'serve-back-short', name: '下旋短发球', category: '开局发球', mode: 'serve', description: '本方近网一跳、对方近网二跳的低短下旋。', speedMps: 4.7, topRpm: -3200, sideRpm: 0, corkRpm: 0, firstBounceMm: 760, targetDepthMm: 1780, launchHeightMm: 1050, cadence: 0.8, spreadMm: 35, color: blue },
  { id: 'serve-side-back', name: '侧下旋发球', category: '开局发球', mode: 'serve', description: '本方中短一跳，过网后向左侧拐并带下旋。', speedMps: 5.0, topRpm: -2800, sideRpm: 2400, corkRpm: 900, firstBounceMm: 720, targetDepthMm: 1940, launchHeightMm: 1060, cadence: 0.75, spreadMm: 45, color: purple },
  { id: 'serve-side-top', name: '侧上旋发球', category: '开局发球', mode: 'serve', description: '本方中短一跳，过网后二跳向前并向右窜。', speedMps: 5.2, topRpm: 2200, sideRpm: -2600, corkRpm: -900, firstBounceMm: 700, targetDepthMm: 2100, launchHeightMm: 1060, cadence: 0.75, spreadMm: 45, color: purple },
  { id: 'serve-reverse', name: '逆旋转发球', category: '开局发球', mode: 'serve', description: '逆向侧下旋，二跳方向与常规侧旋相反。', speedMps: 5.0, topRpm: -2500, sideRpm: -2900, corkRpm: -1000, firstBounceMm: 720, targetDepthMm: 1940, launchHeightMm: 1060, cadence: 0.7, spreadMm: 50, color: purple },
  { id: 'serve-fast-long', name: '奔球/急长', category: '开局发球', mode: 'serve', description: '本方较深一跳、低平过网，第二跳压接球方端线。', speedMps: 6.4, topRpm: 1500, sideRpm: 800, corkRpm: 300, firstBounceMm: 850, targetDepthMm: 2550, launchHeightMm: 1080, cadence: 0.7, spreadMm: 55, color: gold },
  { id: 'float-short', name: '无旋短球', category: '基础球', description: '低速、近网落点，练习上步和小球处理。', speedMps: 4.2, topRpm: 0, sideRpm: 0, corkRpm: 0, targetDepthMm: 1740, launchHeightMm: 1080, cadence: 1.1, spreadMm: 35, color: orange, shortcut: '1' },
  { id: 'float-long', name: '无旋长球', category: '基础球', description: '中速长落点，轨迹最接近纯抛体基准。', speedMps: 6.5, topRpm: 0, sideRpm: 0, corkRpm: 0, targetDepthMm: 2480, launchHeightMm: 1120, cadence: 1.2, spreadMm: 45, color: orange, shortcut: '2' },
  { id: 'drive', name: '平击快攻', category: '基础球', description: '速度优先、旋转较少的快速进攻球。', speedMps: 9.0, topRpm: 900, sideRpm: 0, corkRpm: 0, targetDepthMm: 2420, launchHeightMm: 1190, cadence: 1.3, spreadMm: 55, color: orange, shortcut: '3' },
  { id: 'lob', name: '高吊球', category: '基础球', description: '高弧线、低速度，模拟被动防守高球。', speedMps: 4.0, topRpm: 700, sideRpm: 0, corkRpm: 0, targetDepthMm: 2280, launchHeightMm: 1460, cadence: 0.8, spreadMm: 80, color: orange },

  { id: 'top-light', name: '轻上旋', category: '上旋进攻', description: '温和下扎，落台后轻微前冲。', speedMps: 5.5, topRpm: 1800, sideRpm: 0, corkRpm: 0, targetDepthMm: 2180, launchHeightMm: 1140, cadence: 1.3, spreadMm: 45, color: red, shortcut: '4' },
  { id: 'top-drive', name: '上旋快带', category: '上旋进攻', description: '较平、较快的连续上旋来球。', speedMps: 8.0, topRpm: 3200, sideRpm: 0, corkRpm: 0, targetDepthMm: 2350, launchHeightMm: 1190, cadence: 1.6, spreadMm: 55, color: red },
  { id: 'loop-spin', name: '加转弧圈', category: '上旋进攻', description: '速度中等、旋转强、弧线明显。', speedMps: 6.5, topRpm: 6200, sideRpm: 0, corkRpm: 0, targetDepthMm: 2220, launchHeightMm: 1260, cadence: 1.1, spreadMm: 60, color: red, shortcut: '5' },
  { id: 'loop-fast', name: '前冲弧圈', category: '上旋进攻', description: '高速强上旋，过网后快速下扎并前冲。', speedMps: 10.5, topRpm: 5200, sideRpm: 0, corkRpm: 0, targetDepthMm: 2470, launchHeightMm: 1280, cadence: 1.1, spreadMm: 65, color: red, shortcut: '6' },

  { id: 'back-light', name: '轻下旋', category: '下旋控制', description: '轻微飘起，落台后前冲减弱。', speedMps: 4.6, topRpm: -1800, sideRpm: 0, corkRpm: 0, targetDepthMm: 1970, launchHeightMm: 1110, cadence: 1.2, spreadMm: 40, color: blue, shortcut: '7' },
  { id: 'push', name: '搓球', category: '下旋控制', description: '低速中下旋、落点较短。', speedMps: 4.8, topRpm: -3300, sideRpm: 0, corkRpm: 0, targetDepthMm: 1840, launchHeightMm: 1080, cadence: 1.2, spreadMm: 40, color: blue },
  { id: 'chop', name: '削球', category: '下旋控制', description: '中长落点、强下旋和较高弧线。', speedMps: 5.4, topRpm: -5200, sideRpm: 0, corkRpm: 0, targetDepthMm: 2260, launchHeightMm: 1370, cadence: 0.9, spreadMm: 75, color: blue, shortcut: '8' },
  { id: 'back-heavy', name: '强下旋', category: '下旋控制', description: '高旋转低前进速度，落台后明显减速。', speedMps: 5.0, topRpm: -7000, sideRpm: 0, corkRpm: 0, targetDepthMm: 2040, launchHeightMm: 1250, cadence: 0.85, spreadMm: 55, color: blue },

  { id: 'side-left', name: '左侧旋', category: '侧旋组合', description: '飞行向左偏转，落台带轻微侧拐。', speedMps: 5.8, topRpm: 0, sideRpm: 3600, corkRpm: 1200, targetDepthMm: 2160, launchHeightMm: 1180, cadence: 1.1, spreadMm: 55, color: purple, shortcut: '9' },
  { id: 'side-right', name: '右侧旋', category: '侧旋组合', description: '飞行向右偏转，落台带轻微侧拐。', speedMps: 5.8, topRpm: 0, sideRpm: -3600, corkRpm: -1200, targetDepthMm: 2160, launchHeightMm: 1180, cadence: 1.1, spreadMm: 55, color: purple },
  { id: 'side-top-left', name: '左侧上旋', category: '侧旋组合', description: '左侧偏转与落台前冲叠加。', speedMps: 7.2, topRpm: 3800, sideRpm: 2700, corkRpm: 900, targetDepthMm: 2320, launchHeightMm: 1250, cadence: 1.2, spreadMm: 65, color: purple },
  { id: 'side-top-right', name: '右侧上旋', category: '侧旋组合', description: '右侧偏转与落台前冲叠加。', speedMps: 7.2, topRpm: 3800, sideRpm: -2700, corkRpm: -900, targetDepthMm: 2320, launchHeightMm: 1250, cadence: 1.2, spreadMm: 65, color: purple },
  { id: 'side-back-left', name: '左侧下旋', category: '侧旋组合', description: '左侧偏转并在落台后减速。', speedMps: 5.4, topRpm: -3800, sideRpm: 2800, corkRpm: 1000, targetDepthMm: 2050, launchHeightMm: 1230, cadence: 1.0, spreadMm: 55, color: purple },
  { id: 'side-back-right', name: '右侧下旋', category: '侧旋组合', description: '右侧偏转并在落台后减速。', speedMps: 5.4, topRpm: -3800, sideRpm: -2800, corkRpm: -1000, targetDepthMm: 2050, launchHeightMm: 1230, cadence: 1.0, spreadMm: 55, color: purple },

  { id: 'smash', name: '扣杀', category: '极限球', description: '高速、低旋转、深落点的压迫来球。', speedMps: 13.5, topRpm: 1200, sideRpm: 0, corkRpm: 0, targetDepthMm: 2520, launchHeightMm: 1370, cadence: 0.75, spreadMm: 90, color: gold },
  { id: 'top-extreme', name: '极强上旋', category: '极限球', description: '接近高水平旋转范围的强烈下扎球。', speedMps: 8.5, topRpm: 7800, sideRpm: 0, corkRpm: 0, targetDepthMm: 2390, launchHeightMm: 1380, cadence: 0.75, spreadMm: 80, color: gold },
  { id: 'back-extreme', name: '极强下旋', category: '极限球', description: '高强度下旋，落台后显著制动。', speedMps: 5.8, topRpm: -7800, sideRpm: 0, corkRpm: 0, targetDepthMm: 2180, launchHeightMm: 1430, cadence: 0.7, spreadMm: 70, color: gold },
  { id: 'knuckle', name: '飘忽球', category: '极限球', description: '极低旋转并加入轻微落点扰动。', speedMps: 6.3, topRpm: 80, sideRpm: -60, corkRpm: 40, targetDepthMm: 2260, launchHeightMm: 1210, cadence: 1.0, spreadMm: 130, color: gold },
];

export const SHOT_CATEGORIES: readonly ShotCategory[] = [
  '开局发球', '基础球', '上旋进攻', '下旋控制', '侧旋组合', '极限球',
];

const BALL_RADIUS = 0.020;
const BALL_MASS = 0.0027;
const BALL_AREA = Math.PI * BALL_RADIUS ** 2;
const BALL_VOLUME = (4 / 3) * Math.PI * BALL_RADIUS ** 3;
const BALL_INERTIA = (2 / 3) * BALL_MASS * BALL_RADIUS ** 2;
const BALL_TABLE_FRICTION = 0.25;
const AIR_DENSITY = 1.204;
const DRAG_COEFFICIENT = 0.55;
const GRAVITY = 9.81;
const TABLE_CONTACT_Y = 0.805;
const NET_X = 1.370;
const NET_CLEAR_Y = 0.988;
const RPM_TO_RAD = 2 * Math.PI / 60;

const laneZ: Record<Exclude<TargetLane, 'random'>, number> = {
  forehand: -0.25,
  middle: -0.7625,
  backhand: -1.275,
};

interface SimState { x: number; y: number; z: number; vx: number; vy: number; vz: number; }
interface SimResult { state: SimState; time: number; netY: number; }

function advanceSimulation(
  state: SimState,
  angularVelocity: { x: number; y: number; z: number },
  dt: number,
): void {
  const speed = Math.hypot(state.vx, state.vy, state.vz);
  const dragScale = speed > 1e-6
    ? -0.5 * AIR_DENSITY * DRAG_COEFFICIENT * BALL_AREA * speed / BALL_MASS
    : 0;
  let ax = dragScale * state.vx;
  let ay = -GRAVITY + dragScale * state.vy;
  let az = dragScale * state.vz;
  const crossX = angularVelocity.y * state.vz - angularVelocity.z * state.vy;
  const crossY = angularVelocity.z * state.vx - angularVelocity.x * state.vz;
  const crossZ = angularVelocity.x * state.vy - angularVelocity.y * state.vx;
  const crossMagnitude = Math.hypot(crossX, crossY, crossZ);
  if (crossMagnitude > 1e-5 && speed > 0.1) {
    const spinParameter = BALL_RADIUS * crossMagnitude / (speed * speed);
    const liftCoefficient = 0.5 * (1 - Math.exp(-1.8 * spinParameter));
    const liftAcceleration = 0.5 * AIR_DENSITY * BALL_AREA * liftCoefficient * speed * speed / BALL_MASS;
    const scale = liftAcceleration / crossMagnitude;
    ax += scale * crossX;
    ay += scale * crossY;
    az += scale * crossZ;
  }
  state.vx += ax * dt; state.vy += ay * dt; state.vz += az * dt;
  state.x += state.vx * dt; state.y += state.vy * dt; state.z += state.vz * dt;
}

function simulateToTarget(
  origin: SimState,
  angularVelocity: { x: number; y: number; z: number },
  targetX: number,
): SimResult {
  const state = { ...origin };
  const dt = 1 / 480;
  let time = 0;
  let netY = origin.y;
  let recordedNet = false;

  while (state.x < targetX && time < 1.5) {
    advanceSimulation(state, angularVelocity, dt);
    time += dt;

    if (!recordedNet && state.x >= NET_X) {
      netY = state.y;
      recordedNet = true;
    }
  }

  return { state, time, netY };
}

function evaluateServe(
  origin: SimState,
  angularVelocity: { x: number; y: number; z: number },
): { firstX?: number; secondX?: number; netY: number } {
  const state = { ...origin };
  const w = { ...angularVelocity };
  const hits: number[] = [];
  let netY = 0;
  let sawNet = false;
  const dt = 1 / 480;
  for (let t = 0; t < 1.5 && state.x < 3.2 && state.y > 0; t += dt) {
    const previousY = state.y;
    advanceSimulation(state, w, dt);
    if (!sawNet && hits.length > 0 && state.x >= NET_X) { netY = state.y; sawNet = true; }
    if (
      state.vy < 0 && previousY >= TABLE_CONTACT_Y && state.y <= TABLE_CONTACT_Y &&
      state.x >= 0.02 && state.x <= 2.72 && state.z >= -1.505 && state.z <= -0.02
    ) {
      hits.push(state.x);
      const impact = Math.abs(state.vy);
      const restitution = Math.max(0.55, Math.min(0.90, 0.93 - 0.02 * impact));
      const contactVx = state.vx + w.z * BALL_RADIUS;
      const contactVz = state.vz - w.x * BALL_RADIUS;
      const contactSpeed = Math.hypot(contactVx, contactVz);
      let impulseX = 0;
      let impulseZ = 0;
      if (contactSpeed > 1e-6) {
        const stickingImpulse = 0.4 * BALL_MASS * contactSpeed;
        const normalImpulse = BALL_MASS * (1 + restitution) * impact;
        const impulseMagnitude = Math.min(stickingImpulse, BALL_TABLE_FRICTION * normalImpulse);
        impulseX = -impulseMagnitude * contactVx / contactSpeed;
        impulseZ = -impulseMagnitude * contactVz / contactSpeed;
      }
      state.y = TABLE_CONTACT_Y;
      state.vy = impact * restitution;
      state.vx += impulseX / BALL_MASS;
      state.vz += impulseZ / BALL_MASS;
      w.x -= BALL_RADIUS * impulseZ / BALL_INERTIA;
      w.z += BALL_RADIUS * impulseX / BALL_INERTIA;
      if (hits.length >= 2) break;
    }
  }
  return { firstX: hits[0], secondX: hits[1], netY };
}

function randomTargetZ(settings: MachineSettings, spreadMm: number): number {
  const base = settings.targetLane === 'random'
    ? -0.18 - Math.random() * 1.165
    : laneZ[settings.targetLane];
  const spread = settings.randomize ? (Math.random() - 0.5) * spreadMm / 1000 : 0;
  return Math.max(-1.45, Math.min(-0.075, base + spread));
}

export function solveLaunch(
  preset: ShotPreset,
  settings: MachineSettings,
): LaunchSolution {
  const strength = Math.max(0.6, Math.min(1.4, settings.strength));
  const level = PLAYER_LEVELS[settings.playerLevel] ?? PLAYER_LEVELS.advanced;
  const speed = preset.speedMps * strength * level.speedScale;
  const spinScale = (0.75 + 0.25 * strength) * level.spinScale;
  const angularVelocity = {
    x: preset.corkRpm * spinScale * RPM_TO_RAD,
    y: preset.sideRpm * spinScale * RPM_TO_RAD,
    z: -preset.topRpm * spinScale * RPM_TO_RAD,
  };
  const targetX = preset.targetDepthMm / 1000 +
    (settings.randomize ? (Math.random() - 0.5) * preset.spreadMm / 1500 : 0);
  const targetZ = randomTargetZ(settings, preset.spreadMm);
  if (preset.mode === 'serve') {
    // A legal table-tennis serve first descends onto the server's half, then
    // clears the net after the bounce and lands on the receiver's half.
    // These launch values are calibrated to that two-bounce geometry; spin
    // and the explicit table-contact impulse create the selected kick.
    const originX = 0.10;
    const originY = preset.launchHeightMm / 1000;
    const originZ = -0.7625;
    const preferredVx = Math.max(3.8, Math.min(6.7, preset.speedMps * strength));
    const firstTargetX = (preset.firstBounceMm ?? 720) / 1000;
    let vy = -2.2;
    let vx = preferredVx;
    let vz = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let speedStep = -8; speedStep <= 8; speedStep += 1) {
      const candidateVx = Math.max(3.5, Math.min(7.0, preferredVx + speedStep * 0.12));
      const travel = Math.max(0.32, (targetX - originX) / candidateVx);
      const candidateVz = (targetZ - originZ) / travel;
      for (let i = 0; i <= 70; i += 1) {
        const candidateVy = -0.65 - i * 0.055;
        const outcome = evaluateServe(
          { x: originX, y: originY, z: originZ, vx: candidateVx, vy: candidateVy, vz: candidateVz },
          angularVelocity,
        );
        let score = outcome.secondX === undefined ? 50 : Math.abs(outcome.secondX - targetX) * 2;
        score += outcome.firstX === undefined ? 50 : Math.abs(outcome.firstX - firstTargetX) * 1.3;
        if (outcome.firstX !== undefined && outcome.firstX >= NET_X) score += 50;
        if (outcome.secondX !== undefined && (outcome.secondX <= NET_X || outcome.secondX >= 2.72)) score += 50;
        if (outcome.netY < 0.965) score += (0.965 - outcome.netY) * 30;
        if (outcome.netY > 1.12) score += (outcome.netY - 1.12) * 2;
        score += Math.abs(candidateVx - preferredVx) * 0.035;
        if (score < bestScore) {
          bestScore = score; vx = candidateVx; vy = candidateVy; vz = candidateVz;
        }
      }
    }
    const predicted = evaluateServe(
      { x: originX, y: originY, z: originZ, vx, vy, vz }, angularVelocity,
    );
    return {
      originMm: { x: originX * 1000, y: originY * 1000, z: originZ * 1000 },
      velocityMm: { x: vx * 1000, y: vy * 1000, z: vz * 1000 },
      angularVelocity,
      targetMm: { x: targetX * 1000, y: TABLE_CONTACT_Y * 1000, z: targetZ * 1000 },
      speedMps: Math.hypot(vx, vy, vz),
      spinRpm: Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm) * spinScale,
      netClearanceMm: (predicted.netY - 0.937) * 1000,
    };
  }
  let originY = preset.launchHeightMm / 1000;
  const originX = -0.18;
  const originZ = -0.7625;
  let vz = (targetZ - originZ) * speed / Math.max(1, targetX - originX);
  let bestVy = 0;
  let result!: SimResult;

  // Iteratively compensate both aerodynamic drop/lift and lateral Magnus drift.
  for (let clearanceAttempt = 0; clearanceAttempt < 4; clearanceAttempt += 1) {
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
    if (result.netY >= NET_CLEAR_Y) break;
    originY += NET_CLEAR_Y - result.netY + 0.025;
  }

  const vx = Math.sqrt(Math.max(1, speed * speed - vz * vz));
  result = simulateToTarget(
    { x: originX, y: originY, z: originZ, vx, vy: bestVy, vz },
    angularVelocity,
    targetX,
  );

  return {
    originMm: { x: originX * 1000, y: originY * 1000, z: originZ * 1000 },
    velocityMm: { x: vx * 1000, y: bestVy * 1000, z: vz * 1000 },
    angularVelocity,
    targetMm: { x: targetX * 1000, y: TABLE_CONTACT_Y * 1000, z: targetZ * 1000 },
    speedMps: Math.hypot(vx, bestVy, vz),
    spinRpm: Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm) * spinScale,
    netClearanceMm: (result.netY - 0.937) * 1000,
  };
}

export function sampleTrajectory(
  solution: LaunchSolution,
  seconds = 1.25,
): Array<{ x: number; y: number; z: number }> {
  const w = { ...solution.angularVelocity };
  const state: SimState = {
    x: solution.originMm.x / 1000, y: solution.originMm.y / 1000,
    z: solution.originMm.z / 1000, vx: solution.velocityMm.x / 1000,
    vy: solution.velocityMm.y / 1000, vz: solution.velocityMm.z / 1000,
  };
  const points: Array<{ x: number; y: number; z: number }> = [];
  const dt = 1 / 240;
  let bounces = 0;
  for (let t = 0; t < seconds && state.y > 0 && state.x < 3.35 && Math.abs(state.z) < 2.2; t += dt) {
    const previousY = state.y;
    advanceSimulation(state, w, dt);
    if (
      bounces < 3 && state.vy < 0 && previousY >= TABLE_CONTACT_Y && state.y <= TABLE_CONTACT_Y &&
      state.x >= 0.02 && state.x <= 2.72 && state.z >= -1.505 && state.z <= -0.02
    ) {
      const impact = Math.abs(state.vy);
      const restitution = Math.max(0.55, Math.min(0.90, 0.93 - 0.02 * impact));
      const contactVx = state.vx + w.z * BALL_RADIUS;
      const contactVz = state.vz - w.x * BALL_RADIUS;
      const contactSpeed = Math.hypot(contactVx, contactVz);
      let impulseX = 0;
      let impulseZ = 0;
      if (contactSpeed > 1e-6) {
        const stickingImpulse = 0.4 * BALL_MASS * contactSpeed;
        const normalImpulse = BALL_MASS * (1 + restitution) * impact;
        const impulseMagnitude = Math.min(stickingImpulse, BALL_TABLE_FRICTION * normalImpulse);
        impulseX = -impulseMagnitude * contactVx / contactSpeed;
        impulseZ = -impulseMagnitude * contactVz / contactSpeed;
      }
      state.y = TABLE_CONTACT_Y;
      state.vy = impact * restitution;
      state.vx += impulseX / BALL_MASS;
      state.vz += impulseZ / BALL_MASS;
      w.x -= BALL_RADIUS * impulseZ / BALL_INERTIA;
      w.z += BALL_RADIUS * impulseX / BALL_INERTIA;
      bounces += 1;
    }
    points.push({ x: state.x * 1000, y: state.y * 1000, z: state.z * 1000 });
  }
  return points;
}

export function getPreset(id: string): ShotPreset {
  return SHOT_PRESETS.find(preset => preset.id === id) ?? SHOT_PRESETS[0];
}
