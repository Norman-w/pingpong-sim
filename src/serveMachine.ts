export type ShotCategory = '开局发球' | '基础球' | '上旋进攻' | '下旋控制' | '侧旋组合' | '异质胶皮' | '极限球';
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

interface ServeProfile {
  originXmm: number;
  originZmm: number;
  minNetClearanceMm: number;
  maxNetClearanceMm: number;
}

export type RubberKey = 'inverted-grippy' | 'inverted-tacky' | 'short-pips' | 'medium-pips' | 'long-pips' | 'anti-spin';
export type BallLength = 'short' | 'half-long' | 'long';
export interface RubberProfile {
  label: string;
  structure: string;
  behavior: string;
  typicalUse: string;
}
export interface ShotKnowledge {
  family: string;
  length: BallLength;
  commonRubbers: RubberKey[];
  production: string;
  flight: string;
  bounce: string;
  readingCues: string;
  tacticalIntent: string;
  handlingFocus: string;
}

export const RUBBER_PROFILES: Record<RubberKey, RubberProfile> = {
  'inverted-grippy': { label: '高摩擦反胶', structure: '颗粒向内、外表面平滑，通常配海绵。', behavior: '主动摩擦和包裹能力强，容易制造上旋、下旋与侧旋，也最吃来球旋转。', typicalUse: '弧圈、快攻、搓摆、拧拉和大多数高质量发球。' },
  'inverted-tacky': { label: '黏性反胶', structure: '反胶结构，表层黏性较强，常配较硬海绵。', behavior: '低速薄摩擦时仍能咬住球，便于制造强下旋、强侧下旋和高弧线加转。', typicalUse: '发抢、台内控制、强下旋和加转弧圈。' },
  'short-pips': { label: '正胶/短颗粒', structure: '短颗粒向外，可配海绵。', behavior: '出球直接、弧线较平，主动旋转低于反胶，但对中低强度来旋更不敏感。', typicalUse: '近台快攻、弹击、快挡和快速不转/弱旋变化。' },
  'medium-pips': { label: '生胶/中颗粒', structure: '颗粒长度介于短颗粒与长颗粒之间。', behavior: '摩擦和形变响应更非线性，容易形成下沉、发飘和节奏变化。', typicalUse: '近台弹击、卸力挡、沉球和速度突变。' },
  'long-pips': { label: '长胶', structure: '细长颗粒向外，可带薄海绵或不带海绵。', behavior: '颗粒弯折使回球受来球旋转影响显著，常表现为旋转延续后在对手视角形成“反转”、低速下沉或飘忽。', typicalUse: '削球、磕挡、拱、刮和节奏破坏。' },
  'anti-spin': { label: '防弧胶', structure: '低摩擦反胶表面配低弹海绵。', behavior: '主动制造旋转能力弱，吸收速度并弱化或保留部分来旋，常产生很短、很死的不转/弱旋球。', typicalUse: '卸力挡、变节奏、控制强旋转来球。' },
};

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
  serveImpactsMm?: {
    first: { x: number; z: number; timeMs: number };
    second: { x: number; z: number; timeMs: number };
  };
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

const orange = 0xff9f43;
const red = 0xff5d73;
const blue = 0x54a0ff;
const purple = 0xa66cff;
const gold = 0xffd166;
const teal = 0x2ed6c4;

export const SHOT_PRESETS: readonly ShotPreset[] = [
  { id: 'serve-float-short', name: '无旋短发球', category: '开局发球', mode: 'serve', description: '本方近网先落台，过网后在对方近网区二跳。', speedMps: 4.8, topRpm: 0, sideRpm: 0, corkRpm: 0, firstBounceMm: 720, targetDepthMm: 1740, launchHeightMm: 1050, cadence: 0.8, spreadMm: 30, color: orange },
  { id: 'serve-back-short', name: '下旋短发球', category: '开局发球', mode: 'serve', description: '本方近网一跳、对方近网二跳的低短下旋。', speedMps: 4.7, topRpm: -3200, sideRpm: 0, corkRpm: 0, firstBounceMm: 760, targetDepthMm: 1780, launchHeightMm: 1050, cadence: 0.8, spreadMm: 35, color: blue },
  { id: 'serve-side-back', name: '侧下旋发球', category: '开局发球', mode: 'serve', description: '本方中短一跳，过网后向左侧拐并带下旋。', speedMps: 5.0, topRpm: -2800, sideRpm: 2400, corkRpm: 900, firstBounceMm: 720, targetDepthMm: 1940, launchHeightMm: 1060, cadence: 0.75, spreadMm: 45, color: purple },
  { id: 'serve-side-top', name: '侧上旋发球', category: '开局发球', mode: 'serve', description: '本方中短一跳，过网后二跳向前并向右窜。', speedMps: 5.2, topRpm: 2200, sideRpm: -2600, corkRpm: -900, firstBounceMm: 700, targetDepthMm: 2100, launchHeightMm: 1060, cadence: 0.75, spreadMm: 45, color: purple },
  { id: 'serve-reverse', name: '逆旋转发球', category: '开局发球', mode: 'serve', description: '逆向侧下旋，二跳方向与常规侧旋相反。', speedMps: 5.0, topRpm: -2500, sideRpm: -2900, corkRpm: -1000, firstBounceMm: 720, targetDepthMm: 1940, launchHeightMm: 1060, cadence: 0.7, spreadMm: 50, color: purple },
  { id: 'serve-fast-long', name: '奔球/急长', category: '开局发球', mode: 'serve', description: '低重心贴近端线触球，本方端线附近快速一跳后低平过网，第二跳压接球方端线。', speedMps: 10.0, topRpm: 1800, sideRpm: 700, corkRpm: 250, firstBounceMm: 300, targetDepthMm: 2620, launchHeightMm: 900, cadence: 0.7, spreadMm: 45, color: gold },
  { id: 'serve-pendulum-top', name: '顺旋侧上', category: '开局发球', mode: 'serve', description: '正手顺旋动作制造侧上旋，落台后向前并横向窜出。', speedMps: 5.4, topRpm: 2600, sideRpm: 2900, corkRpm: 700, firstBounceMm: 735, targetDepthMm: 2180, launchHeightMm: 1060, cadence: 0.75, spreadMm: 45, color: purple },
  { id: 'serve-reverse-top', name: '逆旋侧上', category: '开局发球', mode: 'serve', description: '逆旋转动作的侧上旋变化，侧拐方向与顺旋相反。', speedMps: 5.4, topRpm: 2400, sideRpm: -3000, corkRpm: -800, firstBounceMm: 730, targetDepthMm: 2160, launchHeightMm: 1060, cadence: 0.72, spreadMm: 50, color: purple },
  { id: 'serve-tomahawk-back', name: '砍式侧下', category: '开局发球', mode: 'serve', description: '砍式/战斧动作从球侧下方摩擦，形成明显侧下旋。', speedMps: 5.1, topRpm: -3000, sideRpm: -3200, corkRpm: -1000, firstBounceMm: 740, targetDepthMm: 1950, launchHeightMm: 1080, cadence: 0.7, spreadMm: 55, color: purple },
  { id: 'serve-tomahawk-top', name: '砍式侧上', category: '开局发球', mode: 'serve', description: '同类砍式引拍伪装下改摩擦球侧上方，形成侧上旋。', speedMps: 5.5, topRpm: 2300, sideRpm: -3200, corkRpm: -900, firstBounceMm: 720, targetDepthMm: 2200, launchHeightMm: 1080, cadence: 0.7, spreadMm: 55, color: purple },
  { id: 'serve-hook-back', name: '勾式侧下', category: '开局发球', mode: 'serve', description: '勾式发球用内收路径刷球侧下部，侧旋比例较高。', speedMps: 5.0, topRpm: -2600, sideRpm: 3400, corkRpm: 1100, firstBounceMm: 720, targetDepthMm: 1900, launchHeightMm: 1070, cadence: 0.68, spreadMm: 55, color: purple },
  { id: 'serve-high-toss-back', name: '高抛强下旋', category: '开局发球', mode: 'serve', description: '借高抛下落速度和手腕加速制造强下旋，二跳仍保持低短。', speedMps: 5.1, topRpm: -4800, sideRpm: 500, corkRpm: 200, firstBounceMm: 780, targetDepthMm: 1860, launchHeightMm: 1120, cadence: 0.6, spreadMm: 40, color: blue },
  { id: 'serve-backhand-side', name: '反手侧下', category: '开局发球', mode: 'serve', description: '反手位横向摩擦配合切下动作，形成反方向侧下旋。', speedMps: 5.0, topRpm: -2500, sideRpm: -2700, corkRpm: -700, firstBounceMm: 745, targetDepthMm: 1980, launchHeightMm: 1060, cadence: 0.75, spreadMm: 45, color: purple },
  { id: 'serve-shovel-back', name: '铲式侧下', category: '开局发球', mode: 'serve', description: '铲式/勺式动作从球侧下方横向刷过，旋转方向接近逆旋。', speedMps: 5.0, topRpm: -2700, sideRpm: -3200, corkRpm: -1100, firstBounceMm: 735, targetDepthMm: 1930, launchHeightMm: 1060, cadence: 0.68, spreadMm: 50, color: purple },
  { id: 'serve-ghost', name: '回跳强下旋', category: '开局发球', mode: 'serve', description: '极薄摩擦制造高比例下旋，第二跳明显停顿，理想状态可向网方向回跳。', speedMps: 4.3, topRpm: -5600, sideRpm: 0, corkRpm: 0, firstBounceMm: 790, targetDepthMm: 1700, launchHeightMm: 1070, cadence: 0.55, spreadMm: 30, color: blue },
  { id: 'serve-punch-float', name: '急不转偷袭', category: '开局发球', mode: 'serve', description: '低重心在端线后突然厚碰撞，近端线一跳后快速压向接球方底线。', speedMps: 10.4, topRpm: 180, sideRpm: 120, corkRpm: 50, firstBounceMm: 320, targetDepthMm: 2630, launchHeightMm: 910, cadence: 0.65, spreadMm: 40, color: gold },
  { id: 'serve-kicker', name: '侧上窜球', category: '开局发球', mode: 'serve', description: '侧上旋比例高，落台后二跳又向前又向侧面突然窜出。', speedMps: 5.7, topRpm: 3000, sideRpm: 3600, corkRpm: 1200, firstBounceMm: 740, targetDepthMm: 2260, launchHeightMm: 1080, cadence: 0.68, spreadMm: 55, color: purple },
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

  { id: 'short-pips-hit', name: '正胶快弹', category: '异质胶皮', description: '短颗粒近台迎前弹击，速度直接、旋转较弱、弧线偏平。', speedMps: 9.2, topRpm: 650, sideRpm: 0, corkRpm: 0, targetDepthMm: 2430, launchHeightMm: 1160, cadence: 1.45, spreadMm: 55, color: teal },
  { id: 'short-pips-block', name: '正胶快挡', category: '异质胶皮', description: '短颗粒借力快挡，来球到达更早但二跳前冲弱于反胶弧圈。', speedMps: 7.2, topRpm: 400, sideRpm: 0, corkRpm: 0, targetDepthMm: 2220, launchHeightMm: 1130, cadence: 1.55, spreadMm: 45, color: teal },
  { id: 'medium-pips-sink', name: '生胶下沉', category: '异质胶皮', description: '中颗粒弹击后旋转少、轨迹平，过网后出现明显下沉和节奏突变。', speedMps: 7.6, topRpm: -300, sideRpm: 300, corkRpm: 180, targetDepthMm: 2290, launchHeightMm: 1160, cadence: 1.35, spreadMm: 75, color: teal },
  { id: 'long-pips-chop', name: '长胶削回', category: '异质胶皮', description: '长胶借来球上旋形成对手视角的强下旋回球，速度慢但下沉明显。', speedMps: 4.8, topRpm: -4300, sideRpm: 250, corkRpm: 120, targetDepthMm: 2240, launchHeightMm: 1370, cadence: 0.85, spreadMm: 85, color: teal },
  { id: 'long-pips-chop-block', name: '长胶磕挡', category: '异质胶皮', description: '近台长胶卸力磕挡，球短、低、下沉，旋转强度取决于来球。', speedMps: 4.3, topRpm: -2400, sideRpm: 500, corkRpm: 200, targetDepthMm: 1900, launchHeightMm: 1080, cadence: 1.1, spreadMm: 95, color: teal },
  { id: 'long-pips-float', name: '长胶拱飘', category: '异质胶皮', description: '长胶主动拱推低旋转球，节奏慢且横向/纵向响应不稳定。', speedMps: 5.2, topRpm: -250, sideRpm: 450, corkRpm: 260, targetDepthMm: 2100, launchHeightMm: 1190, cadence: 1.0, spreadMm: 120, color: teal },
  { id: 'anti-dead-block', name: '防弧卸力挡', category: '异质胶皮', description: '低摩擦防弧吸收速度，回球很死、很短，旋转显著弱化。', speedMps: 3.9, topRpm: -180, sideRpm: 80, corkRpm: 40, targetDepthMm: 1860, launchHeightMm: 1090, cadence: 1.0, spreadMm: 70, color: teal },

  { id: 'smash', name: '扣杀', category: '极限球', description: '高速、低旋转、深落点的压迫来球。', speedMps: 13.5, topRpm: 1200, sideRpm: 0, corkRpm: 0, targetDepthMm: 2520, launchHeightMm: 1370, cadence: 0.75, spreadMm: 90, color: gold },
  { id: 'top-extreme', name: '极强上旋', category: '极限球', description: '接近高水平旋转范围的强烈下扎球。', speedMps: 8.5, topRpm: 7800, sideRpm: 0, corkRpm: 0, targetDepthMm: 2390, launchHeightMm: 1380, cadence: 0.75, spreadMm: 80, color: gold },
  { id: 'back-extreme', name: '极强下旋', category: '极限球', description: '高强度下旋，落台后显著制动。', speedMps: 5.8, topRpm: -7800, sideRpm: 0, corkRpm: 0, targetDepthMm: 2180, launchHeightMm: 1430, cadence: 0.7, spreadMm: 70, color: gold },
  { id: 'knuckle', name: '飘忽球', category: '极限球', description: '极低旋转并加入轻微落点扰动。', speedMps: 6.3, topRpm: 80, sideRpm: -60, corkRpm: 40, targetDepthMm: 2260, launchHeightMm: 1210, cadence: 1.0, spreadMm: 130, color: gold },
];

export const SHOT_CATEGORIES: readonly ShotCategory[] = [
  '开局发球', '基础球', '上旋进攻', '下旋控制', '侧旋组合', '异质胶皮', '极限球',
];

const SERVE_FAMILIES: Record<string, string> = {
  'serve-float-short': '不转短发球（动作伪装）',
  'serve-back-short': '纯下旋短发球',
  'serve-side-back': '正手顺旋侧下发球',
  'serve-side-top': '侧上旋发球',
  'serve-reverse': '逆旋转侧下发球',
  'serve-fast-long': '奔球/急长发球',
  'serve-pendulum-top': '正手顺旋侧上发球',
  'serve-reverse-top': '逆旋转侧上发球',
  'serve-tomahawk-back': '砍式/战斧侧下发球',
  'serve-tomahawk-top': '砍式/战斧侧上发球',
  'serve-hook-back': '勾式侧下发球',
  'serve-high-toss-back': '高抛强下旋发球',
  'serve-backhand-side': '反手侧下发球',
  'serve-shovel-back': '铲式/勺式侧下发球',
  'serve-ghost': '回跳/鬼球强下旋发球',
  'serve-punch-float': '急不转/冲击式偷袭发球',
  'serve-kicker': '高比例侧上旋窜球',
};

const SPECIAL_RUBBERS: Record<string, RubberKey[]> = {
  'short-pips-hit': ['short-pips'], 'short-pips-block': ['short-pips'],
  'medium-pips-sink': ['medium-pips'],
  'long-pips-chop': ['long-pips'], 'long-pips-chop-block': ['long-pips'], 'long-pips-float': ['long-pips'],
  'anti-dead-block': ['anti-spin'],
};

function classifyLength(preset: ShotPreset): BallLength {
  if (preset.targetDepthMm < 2050) return 'short';
  if (preset.targetDepthMm <= 2250) return 'half-long';
  return 'long';
}

function commonRubbers(preset: ShotPreset): RubberKey[] {
  if (SPECIAL_RUBBERS[preset.id]) return SPECIAL_RUBBERS[preset.id];
  if (preset.topRpm <= -4200 || preset.mode === 'serve') return ['inverted-tacky', 'inverted-grippy'];
  if (Math.abs(preset.topRpm) < 1000 && preset.speedMps >= 7) return ['short-pips', 'inverted-grippy'];
  return ['inverted-grippy', 'inverted-tacky'];
}

export function getShotKnowledge(preset: ShotPreset): ShotKnowledge {
  const length = classifyLength(preset);
  const rubbers = commonRubbers(preset);
  const side = Math.abs(preset.sideRpm) >= 1200;
  const back = preset.topRpm <= -1200;
  const top = preset.topRpm >= 1200;
  const lowSpin = Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm) < 1000;
  const family = SERVE_FAMILIES[preset.id] ?? (
    preset.id.startsWith('short-pips') ? '短颗粒近台快攻' :
    preset.id.startsWith('medium-pips') ? '中颗粒节奏变化' :
    preset.id.startsWith('long-pips') ? '长胶旋转/节奏变化' :
    preset.id.startsWith('anti-') ? '防弧卸力变化' :
    preset.category
  );
  const production = preset.mode === 'serve'
    ? `${family}通常由手腕和前臂加速、薄摩擦球的${back ? '侧下部' : top ? '侧上部' : '中下部'}产生；触球厚薄与拍面角度用来在相似动作中切换旋转和速度。`
    : rubbers[0] === 'long-pips'
      ? '长颗粒受来球切向速度驱动发生弯折，主动挥拍与来旋共同决定回球；同一动作会随入射旋转变化。'
      : rubbers[0] === 'anti-spin'
        ? '低摩擦表面和低弹海绵吸收速度，主要靠拍面方向和碰撞厚度控制落点，而非主动摩擦造旋。'
        : rubbers[0] === 'medium-pips'
          ? '中颗粒在迎前碰撞时产生较直接的反弹，颗粒形变削弱稳定摩擦，使球出现低旋转和下沉感。'
          : rubbers[0] === 'short-pips'
            ? '短颗粒以迎前碰撞和较短加速制造速度，摩擦量低于反胶，出球更直接。'
            : `${family}主要由反胶摩擦与碰撞配比产生；薄摩擦提高旋转，厚碰撞提高速度。`;
  const flight = lowSpin
    ? '空气中马格努斯力较弱，轨迹更接近受阻抛体；速度或落点的小变化更容易表现为“飘”。'
    : `${back ? '下旋提供向上的马格努斯分量，球更飘、飞行更长' : top ? '上旋提供向下的马格努斯分量，球会更快下扎' : '主要旋转不直接控制上下弧线'}${side ? '；侧旋同时造成横向弯曲' : ''}。`;
  const bounce = back
    ? '触台摩擦会削弱前进速度，强下旋可能表现为停顿或二跳变短。'
    : top
      ? '触台后旋转转化为前进速度，二跳会前冲并压缩反应时间。'
      : side
        ? '触台后横向速度发生变化，二跳侧拐通常比空中弯曲更明显。'
        : '落台后方向变化较小，主要由入射速度、角度和胶皮回弹决定。';
  const readingCues = preset.mode === 'serve'
    ? `优先看触球瞬间而不是随挥：拍面切向运动决定${back ? '下旋' : top ? '上旋' : '弱旋/不转'}，再结合第一落点、过网高度和第二跳是否${length === 'short' ? '留在台内' : length === 'half-long' ? '靠近端线' : '快速出台'}判断长短。`
    : `观察出手动作、球体标记转速、过网弧线与第一跳后的加速变化；${side ? '还要确认侧拐方向，不能只判断上下旋。' : '重点确认旋转强度而不只看速度。'}`;
  const tacticalIntent = length === 'short'
    ? '限制直接大幅度进攻，诱导摆短、劈长、挑打或拧拉，并为下一板创造落点机会。'
    : length === 'half-long'
      ? '让接球者在台内与出台判断之间犹豫；处理过早容易够球，过晚又失去最高点。'
      : '压迫端线和身体位置，逼迫快速移动、借力防守或在下降期处理。';
  const handlingFocus = `${back ? '拍面需更开放并主动向前上方制造过网弧线' : top ? '拍面适当关闭并缩短动作，控制反弹上扬' : '不要把不转球当下旋过度托高'}${side ? '；拍面横向补偿侧旋，并优先把球送向旋转来向的安全区域' : ''}。`;
  return { family, length, commonRubbers: rubbers, production, flight, bounce, readingCues, tacticalIntent, handlingFocus };
}

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

// The nozzle is a 180 mm cylinder centred 175 mm in front of the head
// centre.  With the head at x=-240 mm, its front face is x=25 mm.  Spawn the
// ball centre one radius beyond that face so it starts just outside the mouth
// instead of inside the housing or beside the nozzle.
const MACHINE_BALL_ORIGIN_X = 0.045;

const laneZ: Record<Exclude<TargetLane, 'random'>, number> = {
  // The receiver is at +X and faces -X: a right-handed forehand is on -Z.
  forehand: -1.275,
  middle: -0.7625,
  backhand: -0.25,
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
): {
  first?: { x: number; z: number; time: number };
  second?: { x: number; z: number; time: number };
  netY: number;
} {
  const state = { ...origin };
  const w = { ...angularVelocity };
  const hits: Array<{ x: number; z: number; time: number }> = [];
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
      hits.push({ x: state.x, z: state.z, time: t });
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
  return { first: hits[0], second: hits[1], netY };
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
  let targetX = preset.targetDepthMm / 1000 +
    (settings.randomize ? (Math.random() - 0.5) * preset.spreadMm / 1500 : 0);
  let targetZ = randomTargetZ(settings, preset.spreadMm);
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
    const originY = preset.launchHeightMm / 1000;
    const originZ = profile.originZmm / 1000;
    const preferredVx = Math.max(3.8, Math.min(11.2, speed));
    const firstTargetX = (preset.firstBounceMm ?? 720) / 1000;
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
      // For near-end-line first bounces, favour the shortest contact-to-table
      // interval that still satisfies the complete two-bounce route.
      if (firstTargetX < 0.45) score += outcome.first.time * 0.9;
      score += Math.abs(candidateVx - preferredVx) * 0.025;
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
    return {
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
    };
  }
  let originY = preset.launchHeightMm / 1000;
  const originX = MACHINE_BALL_ORIGIN_X;
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

export interface SampledTrajectory {
  points: Array<{ x: number; y: number; z: number }>;
  tableImpacts: Array<{ x: number; y: number; z: number }>;
}

export function sampleTrajectoryDetails(
  solution: LaunchSolution,
  seconds = 1.25,
): SampledTrajectory {
  const w = { ...solution.angularVelocity };
  const state: SimState = {
    x: solution.originMm.x / 1000, y: solution.originMm.y / 1000,
    z: solution.originMm.z / 1000, vx: solution.velocityMm.x / 1000,
    vy: solution.velocityMm.y / 1000, vz: solution.velocityMm.z / 1000,
  };
  const points: Array<{ x: number; y: number; z: number }> = [];
  const tableImpacts: Array<{ x: number; y: number; z: number }> = [];
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
      tableImpacts.push({ x: state.x * 1000, y: TABLE_CONTACT_Y * 1000, z: state.z * 1000 });
      bounces += 1;
    }
    points.push({ x: state.x * 1000, y: state.y * 1000, z: state.z * 1000 });
  }
  return { points, tableImpacts };
}

export function sampleTrajectory(
  solution: LaunchSolution,
  seconds = 1.25,
): Array<{ x: number; y: number; z: number }> {
  return sampleTrajectoryDetails(solution, seconds).points;
}

export function getPreset(id: string): ShotPreset {
  return SHOT_PRESETS.find(preset => preset.id === id) ?? SHOT_PRESETS[0];
}
