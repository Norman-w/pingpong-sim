# 放高球可处理窗口 — 实施计划

依据 [`lob-contact-philosophy.md`](./lob-contact-philosophy.md)。  
drill-me 已装在 [`.agents/skills/drill-me`](../.agents/skills/drill-me)，实施前用它对齐关键设计判断。

## 现状锚点

- 单一建议点：`contactGuidePosition()` + 落台后 X 平面投影（`src/main.ts` 跟踪循环）
- 接球方：`RECEIVER_PROFILES` 仅有反应/步速/横向触及，无竖直够球高度
- Lob 技术集：`availableTechniquesForPreset` 的 `lob` 分支写死为扣杀优先
- 规则：`BOUNCE_REQUIRED_TECHNIQUES` 含 smash（保持不动）

## 第一期用户可见目标（已校准）

> **要看到：小孩子错过被放高球的「第一合理处理点」时，有明确指示。**

即：上升初期、过网可下压的窗口（窗口 A）对儿童不可达或未抓住时，UI 必须点名「错过了第一合理处理点」，并自然导向下降窗口（窗口 B）作为被迫选择——而不只是默默换一个青色点。

## 目标（第一期只做 lob）

1. **可处理能力**：落台后沿弹起弧采样，输出 `processability ∈ [0,1]`（够球 × 下落预判难度 × 规则合法）。
2. **可处理技术集合**：每点给出允许的 `ContactTechnique[]`。
3. **接球方差异**：儿童/近网上升窗口常坍塌 → 默认偏向下降窗口；成人可偏向上升下压。
4. **UI（优先）**：窗口 A 错过指示（文案/标记状态）+ 轨迹色带；青色标记仍只标一个当前首选点（常为窗口 B）。

## 领域模块

新增 `src/lobProcessability.ts`：

- `ArcPhase`: rise-early | rise | apex | fall | fall-late
- `ProcessabilitySample`: 位置/速度/phase/reachOk/processability/techniques
- `ReceiverReachModel`: maxContactYMm / jumpContactYMm / reactionMs  
  第一期由 `receiverLevel` + `viewHeightMm` 推导，不新增滑条

打分启发式：

- 上升下压：须高于球网且 `y <= jumpContactY`
- 下降处理：`y <= maxContactY`；`vy` 越负惩罚越大（越低越难碰到）
- 未落台 / 二次落台：分为 0，技术集为空

## 接入

1. 跟踪循环：`activePreset.id === 'lob'` 且已落台 → 采样缓存
2. `preferProcessabilitySample` → 驱动青色首选点（儿童下降峰 / 成人上升峰）
3. `availableTechniquesForPreset('lob')` / `updateTechniqueOptions` 读窗口技术集
4. 轨迹按 processability 着色 + 状态栏一行文案

## 刻意不做（第一期）

- 非 lob 球路、改 bounce 规则、完整儿童人体/挥拍仿真、多点实战触球

## 验证

- 成人高吊：上升窗口有扣杀类，首选偏上升
- beginner 近网：上升≈0，下降有分且随高度降低；首选偏下降够得着处
- `npx tsc --noEmit` 通过
