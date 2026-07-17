//#region 导入/依赖
import type { ShotPreset } from './serveMachine';
import {
  detectReplayCueEvents,
  type DetectedReplayCueEvents,
  type ReplayCueSample,
} from './replayCueDetect';
//#endregion

//#region 模型/类型
export type { ReplayCueSample };

export type ReplayCueId =
  | 'opponent-launch'
  | 'opponent-apex'
  | 'server-bounce'
  | 'net'
  | 'receive-bounce'
  | 'rise-mid'
  | 'rise-end'
  | 'receive-apex'
  | 'fall-early'
  | 'fall-mid'
  | 'fall-late'
  | 'ground'
  | 'side-peak'
  | 'post-bounce-kick'
  | 'post-bounce-brake'
  | 'post-net-sink'
  | 'contact';

export interface ReplayCuePoint {
  id: ReplayCueId;
  label: string;
  time: number;
  note: string;
}

export interface ReplayCueRecipeSlot {
  id: ReplayCueId;
  label: string;
  note: string;
}

type CueRecipeItem = ReplayCueRecipeSlot & { time: number | null };
//#endregion

//#region 私有成员
function receivePhaseItems(events: DetectedReplayCueEvents): CueRecipeItem[] {
  return [
    { id: 'rise-mid', label: '我方上升中点', note: '接球方落台后上升中段。', time: events.riseMid },
    { id: 'rise-end', label: '我方上升末点', note: '接近最高点前的上升末段。', time: events.riseEnd },
    { id: 'receive-apex', label: '我方最高点', note: '落台后弧线顶点。', time: events.receiveApex },
    { id: 'fall-early', label: '我方下降初期', note: '过顶点后的下降初段。', time: events.fallEarly },
    { id: 'fall-mid', label: '我方下降中期', note: '下降中段。', time: events.fallMid },
    { id: 'fall-late', label: '我方下降末期', note: '接近第二跳前的下降末段。', time: events.fallLate },
    { id: 'ground', label: '我方坠地', note: '第二跳坠台瞬间。', time: events.ground },
  ];
}

function baseIncomingItems(events: DetectedReplayCueEvents, isServe: boolean): CueRecipeItem[] {
  const items: CueRecipeItem[] = [
    { id: 'opponent-launch', label: '对方出手', note: '对方出手瞬间。', time: events.opponentLaunch },
    { id: 'opponent-apex', label: '对方高点', note: '来球落我方台面之前的飞行最高点。', time: events.opponentApex },
  ];
  if (isServe) {
    items.push({
      id: 'server-bounce',
      label: '对方一跳',
      note: '发球在对手侧台面的第一跳。',
      time: events.serverBounce,
    });
  }
  items.push(
    { id: 'net', label: '过网', note: '球体越过球网平面。', time: events.net },
    { id: 'receive-bounce', label: '我方落台', note: '来球落接球方台面瞬间。', time: events.receiveBounce },
  );
  return items;
}

function recipeForPreset(preset: ShotPreset, events: DetectedReplayCueEvents): CueRecipeItem[] {
  const isServe = preset.mode === 'serve';
  const hasSide = Math.abs(preset.sideRpm) >= 1200;
  const heavyBack = preset.topRpm <= -4000
    || preset.id === 'serve-ghost'
    || preset.id === 'serve-high-toss-back';
  const topspinFamily = preset.category === '上旋进攻'
    || preset.id === 'top-extreme'
    || (preset.category === '极限球' && preset.topRpm >= 3000);
  const backspinFamily = preset.category === '下旋控制'
    || preset.id === 'back-extreme'
    || (preset.category === '极限球' && preset.topRpm <= -3000);
  const sideFamily = preset.category === '侧旋组合' || (isServe && hasSide);

  const contactItem: CueRecipeItem = {
    id: 'contact',
    label: '击球',
    note: '跟球流程锁定的建议击球时刻。',
    time: events.contact,
  };
  const items: CueRecipeItem[] = [
    ...baseIncomingItems(events, isServe),
    ...receivePhaseItems(events),
    contactItem,
  ];

  const insertBefore = (id: ReplayCueId, item: CueRecipeItem): void => {
    const index = items.findIndex(entry => entry.id === id);
    items.splice(index < 0 ? items.length : index, 0, item);
  };

  if (sideFamily || hasSide) {
    insertBefore('net', {
      id: 'side-peak',
      label: '最大侧弯',
      note: '飞行段横向偏移最大处。',
      time: events.sidePeak,
    });
  }
  if (topspinFamily) {
    insertBefore('rise-mid', {
      id: 'post-bounce-kick',
      label: '落台前冲',
      note: '我方落台后前进速度抬升。',
      time: events.postBounceKick,
    });
  }
  if (backspinFamily || heavyBack) {
    insertBefore('rise-mid', {
      id: 'post-bounce-brake',
      label: '落台制动',
      note: '我方落台后前进速度明显衰减。',
      time: events.postBounceBrake,
    });
  }
  if (preset.id === 'medium-pips-sink') {
    insertBefore('receive-bounce', {
      id: 'post-net-sink',
      label: '过网下沉',
      note: '过网后下降变陡的区段。',
      time: events.postNetSink,
    });
  }
  return items;
}

function toCuePoints(items: CueRecipeItem[]): ReplayCuePoint[] {
  const points: ReplayCuePoint[] = [];
  let lastTime = -1;
  for (const item of items) {
    if (item.time === null || !Number.isFinite(item.time)) continue;
    const time = Math.max(item.time, lastTime + 1e-4);
    points.push({ id: item.id, label: item.label, time, note: item.note });
    lastTime = time;
  }
  return points;
}
//#endregion

//#region 公开 API
const EMPTY_EVENTS: DetectedReplayCueEvents = {
  opponentLaunch: 0,
  opponentApex: null,
  serverBounce: null,
  net: null,
  receiveBounce: null,
  riseMid: null,
  riseEnd: null,
  receiveApex: null,
  fallEarly: null,
  fallMid: null,
  fallLate: null,
  ground: null,
  sidePeak: null,
  postBounceKick: null,
  postBounceBrake: null,
  postNetSink: null,
  contact: 0,
};

export function listReplayCueRecipe(preset: ShotPreset): ReplayCueRecipeSlot[] {
  return recipeForPreset(preset, EMPTY_EVENTS).map(({ id, label, note }) => ({ id, label, note }));
}

export function buildReplayCuePoints(
  samples: ReplayCueSample[],
  preset: ShotPreset,
  recordedBounceTimes: number[] = [],
): ReplayCuePoint[] {
  if (samples.length < 2) return [];
  const events = detectReplayCueEvents(samples, recordedBounceTimes, preset.mode === 'serve');
  return toCuePoints(recipeForPreset(preset, events));
}
//#endregion
