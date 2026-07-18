//#region 导入/依赖
//#endregion

//#region 常量/配置
export const TABLE_TECHNIQUES = new Set<ContactTechnique>(['push', 'drop-shot', 'long-push', 'lift', 'forehand-flick', 'backhand-flick']);

// Smash is taken after the receive-side bounce; volleying a lob is illegal.
export const BOUNCE_REQUIRED_TECHNIQUES = new Set<ContactTechnique>([...TABLE_TECHNIQUES, 'smash']);

export const TABLE_CONTACT_AFTER_BOUNCE_MM: Record<ContactTechnique, number> = {
  'forehand-loop': 0,
  'forehand-drive': 0,
  'backhand-loop': 0,
  'counter-loop': 0,
  block: 0,
  punch: 0,
  push: 230,
  'drop-shot': 150,
  'long-push': 300,
  lift: 250,
  'forehand-flick': 280,
  'backhand-flick': 280,
  chop: 0,
  smash: 0,
  lob: 0,
};

export const CONTACT_TECHNIQUES: Record<ContactTechnique, ContactTechniqueSpec> = {
  'forehand-loop': { label: '正手拉球', forwardMm: 500, lateralMm: -620, aboveTableMm: 300, timing: '最高点附近或下降初段', description: '右手持拍者的身体右前方，留出躯干转动和前臂加速空间。' },
  'forehand-drive': { label: '正手快攻', forwardMm: 430, lateralMm: -560, aboveTableMm: 245, timing: '上升后段至最高点', description: '比拉球更靠前、更早迎球，以较短动作借力加速。' },
  'backhand-loop': { label: '反手拉球', forwardMm: 390, lateralMm: -40, aboveTableMm: 245, timing: '上升后段至最高点', description: '针对出台球在身体正前略偏反手侧主动摩擦，区别于台内拧拉。' },
  'counter-loop': { label: '反拉', forwardMm: 460, lateralMm: -420, aboveTableMm: 310, timing: '最高点附近', description: '迎着强上旋主动摩擦并向前发力，拍面关闭程度随来旋增强。' },
  block: { label: '快带/挡', forwardMm: 350, lateralMm: -80, aboveTableMm: 210, timing: '上升期', description: '靠近身体正前方，尽早借用来球速度，动作幅度最短。' },
  punch: { label: '弹击', forwardMm: 360, lateralMm: -60, aboveTableMm: 235, timing: '上升后段', description: '以较厚碰撞和短促前臂加速处理弱旋、下沉或高于球网的来球。' },
  push: { label: '搓球', forwardMm: 520, lateralMm: -160, aboveTableMm: 105, timing: '第一次落台后、第二跳前', description: '接球方台内身前低位触球，拍面进入球下部；绝不等到第二跳出台。', tableContactX: 2300 },
  'drop-shot': { label: '摆短', forwardMm: 570, lateralMm: -120, aboveTableMm: 90, timing: '上升初段', description: '手腕稳定、触球薄且卸力，把短球再次控制在对方台内。', tableContactX: 2240 },
  'long-push': { label: '劈长', forwardMm: 500, lateralMm: -180, aboveTableMm: 115, timing: '上升后段', description: '借来球旋转向前下方加速，将球快速送到对方端线或追身位。', tableContactX: 2320 },
  lift: { label: '托球', forwardMm: 500, lateralMm: -120, aboveTableMm: 145, timing: '上升后段至最高点', description: '用较开拍面向前上方托起来球，适合台内短下旋或旋转不明的控制过渡。', tableContactX: 2300 },
  'forehand-flick': { label: '正手挑打', forwardMm: 535, lateralMm: -420, aboveTableMm: 155, timing: '上升后段至最高点', description: '上步进入台内，以前臂和手腕向前上方加速处理短球。', tableContactX: 2290 },
  'backhand-flick': { label: '反手拧拉', forwardMm: 510, lateralMm: -30, aboveTableMm: 165, timing: '上升后段', description: '肘部前置、手腕绕球侧面摩擦，主动处理短下旋或侧下旋。', tableContactX: 2290 },
  chop: { label: '削球', forwardMm: 420, lateralMm: -600, aboveTableMm: 150, timing: '下降期', description: '身体侧前方较低位置触球，为向下、向前的长挥拍留出空间。' },
  smash: { label: '扣杀', forwardMm: 560, lateralMm: -280, aboveTableMm: 300, timing: '落台后最高点附近或下降初段', description: '高吊球须先落接球方台面；在弹起后的高点附近向下扣杀，未落台击打属于拦击犯规。' },
  lob: { label: '放高球', forwardMm: 300, lateralMm: -350, aboveTableMm: 180, timing: '下降期低点', description: '远台被动时向前上方摩擦并抬高弧线，以深落点争取回位时间。' },
};
//#endregion

//#region 模型/类型
export type ContactTechnique = 'forehand-loop' | 'forehand-drive' | 'backhand-loop' | 'counter-loop' | 'block' | 'punch' | 'push' | 'drop-shot' | 'long-push' | 'lift' | 'forehand-flick' | 'backhand-flick' | 'chop' | 'smash' | 'lob';

export interface ContactTechniqueSpec {
  label: string;
  forwardMm: number;
  lateralMm: number;
  aboveTableMm: number;
  timing: string;
  description: string;
  tableContactX?: number;
}
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
export function receivePreparationMs(technique: ContactTechnique): number {
  if (technique === 'block' || technique === 'punch') return 70;
  if (TABLE_TECHNIQUES.has(technique)) return 90;
  if (technique === 'forehand-drive' || technique === 'backhand-loop') return 120;
  if (technique === 'forehand-loop' || technique === 'counter-loop' || technique === 'chop') return 160;
  return 130;
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
