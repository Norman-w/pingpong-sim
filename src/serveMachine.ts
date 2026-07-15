export type ShotCategory = '基础球' | '上旋进攻' | '下旋控制' | '侧旋组合' | '极限球';
export type TargetLane = 'random' | 'forehand' | 'middle' | 'backhand';

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
}

export interface MachineSettings {
  strength: number;
  cadence: number;
  targetLane: TargetLane;
  randomize: boolean;
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
  '基础球', '上旋进攻', '下旋控制', '侧旋组合', '极限球',
];

const BALL_RADIUS = 0.020;
const BALL_MASS = 0.0027;
const BALL_AREA = Math.PI * BALL_RADIUS ** 2;
const BALL_VOLUME = (4 / 3) * Math.PI * BALL_RADIUS ** 3;
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
    const speed = Math.hypot(state.vx, state.vy, state.vz);
    const dragScale = speed > 1e-6
      ? -0.5 * AIR_DENSITY * DRAG_COEFFICIENT * BALL_AREA * speed / BALL_MASS
      : 0;
    let ax = dragScale * state.vx;
    let ay = -GRAVITY + dragScale * state.vy;
    let az = dragScale * state.vz;

    const spin = Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z);
    if (spin > 1 && speed > 0.1) {
      const coefficient = Math.max(0, Math.min(
        0.5,
        0.1 * speed / (BALL_RADIUS * spin) - 0.001,
      ));
      const scale = AIR_DENSITY * BALL_VOLUME * coefficient / BALL_MASS;
      ax += scale * (angularVelocity.y * state.vz - angularVelocity.z * state.vy);
      ay += scale * (angularVelocity.z * state.vx - angularVelocity.x * state.vz);
      az += scale * (angularVelocity.x * state.vy - angularVelocity.y * state.vx);
    }

    state.vx += ax * dt;
    state.vy += ay * dt;
    state.vz += az * dt;
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.z += state.vz * dt;
    time += dt;

    if (!recordedNet && state.x >= NET_X) {
      netY = state.y;
      recordedNet = true;
    }
  }

  return { state, time, netY };
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
  const speed = preset.speedMps * strength;
  const spinScale = 0.75 + 0.25 * strength;
  const angularVelocity = {
    x: preset.corkRpm * spinScale * RPM_TO_RAD,
    y: preset.sideRpm * spinScale * RPM_TO_RAD,
    z: -preset.topRpm * spinScale * RPM_TO_RAD,
  };
  const targetX = preset.targetDepthMm / 1000 +
    (settings.randomize ? (Math.random() - 0.5) * preset.spreadMm / 1500 : 0);
  const targetZ = randomTargetZ(settings, preset.spreadMm);
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

export function getPreset(id: string): ShotPreset {
  return SHOT_PRESETS.find(preset => preset.id === id) ?? SHOT_PRESETS[0];
}
