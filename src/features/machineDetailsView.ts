//#region 导入/依赖
import { PLAYER_LEVELS, RUBBER_PROFILES, getShotKnowledge, type LaunchSolution, type MachineSettings, type ShotPreset } from '../serveMachine';

//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
export interface MachineDetailParams {
  preset: ShotPreset;
  settings: MachineSettings;
  solution?: LaunchSolution;
  tableCenterZ: number;
}

export interface ParameterDialogParams {
  preset: ShotPreset;
  settings: MachineSettings;
  handlingListHtml: string;
}
//#endregion

//#region 私有成员
function signedSpin(value: number, positive: string, negative: string): string {
  if (Math.abs(value) < 1) return '0';
  return `${value > 0 ? positive : negative} ${Math.round(Math.abs(value))}`;
}
//#endregion

//#region 公开 API
export function buildMachineDetailHtml({ preset, settings, solution, tableCenterZ }: MachineDetailParams): string {
  const knowledge = getShotKnowledge(preset);
  const level = PLAYER_LEVELS[settings.playerLevel] ?? PLAYER_LEVELS.advanced;
  const nominalSpeed = preset.speedMps * settings.strength * level.speedScale;
  const shownSpeed = solution?.speedMps ?? nominalSpeed;
  const spinFactor = (0.75 + 0.25 * settings.strength) * level.spinScale;
  const nominalSpin = Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm) * spinFactor;
  const quality = solution?.quality;
  const outcomeLabel = quality ? ({
    in: '上台',
    net: '下网',
    long: '出端线',
    wide: '出边线',
    'serve-fault': '发球失误',
  } as const)[quality.outcome] : null;
  const stabilityText = settings.randomize
    ? `落点散布约 ±${Math.round(preset.spreadMm * level.accuracyScale)}mm · 球速波动约 ±${Math.round(level.speedVariation * 100)}% · 旋转波动约 ±${Math.round(level.spinVariation * 100)}% · 非受迫失误参考 ${(level.missRate * 100).toFixed(1)}%`
    : '质量/落点波动已关闭：显示该水平的固定基准弧线，不施加随机执行误差';
  const actualQualityText = quality
    ? `<br>本球结果：<b style="color:${quality.outcome === 'in' ? '#5ee6a8' : '#ff697d'}">${outcomeLabel}</b>${quality.landingErrorMm === undefined ? '' : ` · 相对目标偏差 ${Math.round(quality.landingErrorMm)}mm`}`
    : '';
  const clearance = solution ? ` · 过网余量 ${Math.round(solution.netClearanceMm)}mm` : '';
  const predictedFirst = solution?.serveImpactsMm?.first;
  const predictedSecond = solution?.serveImpactsMm?.second;
  const serveRoute = preset.mode === 'serve'
    ? `<br>双跳路线 <span style="color:#54d6ff">● ${Math.round(predictedFirst?.x ?? preset.firstBounceMm ?? 720)}mm</span> → <span style="color:#ffd166">● ${Math.round(predictedSecond?.x ?? preset.targetDepthMm)}mm</span>` +
      (solution ? `<br>出手位置：端线后 ${Math.max(0, Math.round(-solution.originMm.x))}mm · 高 ${Math.round(solution.originMm.y)}mm${predictedFirst ? ` · ${Math.round(predictedFirst.timeMs)}ms 后第一跳` : ''}` : '')
    : '';
  const rallySource = preset.mode !== 'serve' && solution
    ? `<br>动态出球位：${solution.originMm.x < 0 ? `端线后 ${Math.round(-solution.originMm.x)}mm` : `台内 ${Math.round(solution.originMm.x)}mm`} · 横向 ${Math.round(solution.originMm.z - tableCenterZ)}mm · 高 ${Math.round(solution.originMm.y)}mm`
    : '';
  const lengthLabel = knowledge.length === 'short' ? '短球/预计台内二跳' : knowledge.length === 'half-long' ? '半出台球' : '长球/出台球';
  const rubberLabels = knowledge.commonRubbers.map(key => RUBBER_PROFILES[key].label).join('、');
  return (
    `<strong>${preset.name}</strong> · ${preset.description}<br>` +
    `${knowledge.family} · ${lengthLabel}<br><span style="color:#8fa1b7">常见来源：${rubberLabels}</span><br>` +
    `${level.label} · 速度 ${shownSpeed.toFixed(1)}m/s (${Math.round(shownSpeed * 3.6)}km/h)${clearance}${serveRoute}${rallySource}` +
    `<br><span style="color:#8fa1b7">${stabilityText}</span>${actualQualityText}` +
    `<div class="spin-grid">` +
    `<span class="spin-chip">上下旋<b>${signedSpin(preset.topRpm * spinFactor, '上旋', '下旋')} rpm</b></span>` +
    `<span class="spin-chip">侧旋<b>${signedSpin(preset.sideRpm * spinFactor, '左侧', '右侧')} rpm</b></span>` +
    `<span class="spin-chip">轴向旋转<b>${Math.round(Math.abs(preset.corkRpm * spinFactor))} rpm</b></span>` +
    `<span class="spin-chip">合成旋转<b data-testid="composite-spin">${Math.round(solution?.spinRpm ?? nominalSpin)} rpm</b></span>` +
    `</div><button id="parameter-info" class="info-button" type="button">详尽预览与处理方式</button>`
  );
}

export function buildParameterDialogHtml({ preset, settings, handlingListHtml }: ParameterDialogParams): { title: string; content: string } {
  const knowledge = getShotKnowledge(preset);
  const level = PLAYER_LEVELS[settings.playerLevel];
  const rpm = Math.round(Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm) * level.spinScale);
  const rubberDetails = knowledge.commonRubbers.map(key => {
    const rubber = RUBBER_PROFILES[key];
    return `<li><b>${rubber.label}</b>：${rubber.structure}${rubber.behavior} 常见用途：${rubber.typicalUse}</li>`;
  }).join('');
  const content = `
    <p><b>${level.label}</b>：${level.reference}</p>
    <p>质量范围：落点散布约 ±${Math.round(preset.spreadMm * level.accuracyScale)}mm；球速波动约 ±${Math.round(level.speedVariation * 100)}%；旋转波动约 ±${Math.round(level.spinVariation * 100)}%；非受迫失误参考 ${(level.missRate * 100).toFixed(1)}%。关闭“质量/落点波动”可查看无随机波动的基准弧线。</p>
    <h3>球路身份</h3><ul><li>${knowledge.family}</li><li>平动速度：约 ${(preset.speedMps * level.speedScale).toFixed(1)} m/s；合成旋转：约 ${rpm} rpm。</li><li>${preset.mode === 'serve' ? '合法发球路线：先落发球方台面，再越网落到接球方。' : '多球/回合球：由发球机直接模拟对手击球后的入射球。'}</li></ul>
    <h3>常见胶皮来源</h3><ul>${rubberDetails}</ul>
    <h3>怎样产生</h3><p>${knowledge.production}</p>
    <h3>飞行与落台</h3><p>${knowledge.flight} ${knowledge.bounce}</p>
    <h3>识别线索</h3><p>${knowledge.readingCues}</p>
    <h3>战术目的</h3><p>${knowledge.tacticalIntent}</p>
    <h3>处理总原则</h3><p>${knowledge.handlingFocus}</p><ul>${handlingListHtml}</ul>
    <h3>资料与边界</h3><p>胶皮结构按 ITTF 器材规则归类；具体球速、旋转和反弹仍受海绵厚度/硬度、底板、动作、来球和环境影响。参考 <a href="https://documents.ittf.sport/sites/default/files/public/2025-02/2025_ITTF_Statutes_clean_version.pdf" target="_blank" rel="noreferrer">ITTF 2025 器材规则</a>、<a href="https://journals.sagepub.com/doi/10.1177/17543371241310338" target="_blank" rel="noreferrer">不同胶皮实验比较</a>与<a href="https://arxiv.org/abs/2604.11349" target="_blank" rel="noreferrer">多胶皮球拍碰撞建模</a>。</p>`;
  return { title: `${preset.name} · 参数说明`, content };
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
