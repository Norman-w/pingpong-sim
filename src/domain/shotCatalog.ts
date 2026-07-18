//#region 导入/依赖
//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
export type ShotCategory = '开局发球' | '基础球' | '上旋进攻' | '下旋控制' | '侧旋组合' | '异质胶皮' | '极限球';
export type TargetLane = 'random' | 'forehand' | 'middle' | 'backhand';
export type PlayerLevel = 'beginner' | 'club' | 'advanced' | 'world';
export type BallStyle = 'white' | 'yellow' | 'white-yellow-split' | 'white-yellow-eight' | 'rainbow';

export const PLAYER_LEVELS: Record<PlayerLevel, {
  label: string;
  speedScale: number;
  spinScale: number;
  accuracyScale: number;
  speedVariation: number;
  spinVariation: number;
  executionNoiseMps: number;
  missRate: number;
  reference: string;
}> = {
  beginner: { label: '业余入门', speedScale: 0.72, spinScale: 0.48, accuracyScale: 1.9, speedVariation: 0.07, spinVariation: 0.14, executionNoiseMps: 0.16, missRate: 0.08, reference: '动作建立期：弧线偏保守，落点和出球质量波动较大。' },
  club: { label: '业余俱乐部', speedScale: 0.88, spinScale: 0.72, accuracyScale: 1.35, speedVariation: 0.045, spinVariation: 0.09, executionNoiseMps: 0.10, missRate: 0.035, reference: '稳定对练与比赛强度，仍保留可见的落点和质量波动。' },
  advanced: { label: '专业训练', speedScale: 1, spinScale: 1, accuracyScale: 1, speedVariation: 0.025, spinVariation: 0.05, executionNoiseMps: 0.055, missRate: 0.012, reference: '系统训练基准：弧线主动、落点集中、连续质量较稳定。' },
  world: { label: '世界级参考', speedScale: 1.16, spinScale: 1.24, accuracyScale: 0.65, speedVariation: 0.015, spinVariation: 0.03, executionNoiseMps: 0.03, missRate: 0.003, reference: '高水平上限参考：弧线更低更主动，落点和出球质量高度稳定。' },
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
  random?: () => number;
  /** When set, launch solver uses this depth (mm) instead of rolling a new X target. */
  targetDepthOverrideMm?: number;
}

export type ShotOutcome = 'in' | 'net' | 'long' | 'wide' | 'serve-fault';
export interface LaunchQuality {
  outcome: ShotOutcome;
  intendedTargetMm: { x: number; z: number };
  actualLandingMm?: { x: number; z: number };
  landingErrorMm?: number;
  expectedSpreadMm: number;
  missRate: number;
}

export interface LaunchSolution {
  originMm: { x: number; y: number; z: number };
  velocityMm: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
  targetMm: { x: number; y: number; z: number };
  speedMps: number;
  spinRpm: number;
  netClearanceMm: number;
  quality?: LaunchQuality;
  serveImpactsMm?: {
    first: { x: number; z: number; timeMs: number };
    second: { x: number; z: number; timeMs: number };
  };
}

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
  // Depth centers mid-near; with randomize/spread (and demo override) some land
  // nearer, some deeper — too-near shorts tend to leave a second bounce on table.
  { id: 'lob', name: '高吊球', category: '基础球', description: '高弧线、低速度，落点可近可远；落台后起跳点常深入台内。', speedMps: 4.0, topRpm: 700, sideRpm: 0, corkRpm: 0, targetDepthMm: 2050, launchHeightMm: 1480, cadence: 0.8, spreadMm: 200, color: orange },

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

export function getPreset(id: string): ShotPreset {
  return SHOT_PRESETS.find(preset => preset.id === id) ?? SHOT_PRESETS[0];
}

//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
