# 旋转专题 v09 三维成片历史记录（已作废）

> v09 使用旧的有效摩擦参数和旧旁白，不能作为当前成片或发布依据。当前模型、参数和重录要求见 [`../../physics-model-audit.md`](../../physics-model-audit.md) 与 [`../spin-reversal-recording.md`](../spin-reversal-recording.md)。

## 历史文件（不交付）

- 横版母版：`/Users/norman/Movies/pingpong-sim/spin-reversal/exports/pingpong-spin-reversal-master-v09.mp4`
- 竖版裁切：`/Users/norman/Movies/pingpong-sim/spin-reversal/exports/pingpong-spin-reversal-vertical-v09.mp4`
- 画面来源：`pingpong-sim` 浏览器录屏，Three.js 场景、真实台面/球网和 Rapier 实时球；没有使用平面替代动画。
- 画面规格：1920×1080、30 fps、75.4 秒（旧模型，作废）。
- 竖版规格：1080×1920、30 fps、75.4 秒（旧模型，作废）。
- 音频：`/Users/norman/Movies/pingpong-sim/spin-reversal/audio/voiceover_zh-CN_sandy_v09.m4a`，本机 `say` 的 Sandy 中文女声；不是 ChatCut 生成音频。
- 字幕：`/Users/norman/Movies/pingpong-sim/spin-reversal/audio/voiceover_zh-CN_sandy_v09.srt`；横版母版已经烧录字幕。

## 镜头顺序

| 时间 | 画面 | 旁白重点 |
| --- | --- | --- |
| 0:00–0:08 | 真实三维端线视角、蓝红双球和标题 | 同一个球出手时是下旋，碰台后是否仍是下旋 |
| 0:08–0:21 | 标准条件录屏 | 两次落台后旋转减弱，仍是下旋 |
| 0:21–0:31 | 临界条件录屏 | 第二跳后红球接近不转 |
| 0:31–0:40 | 旧版过零录屏 | 第二跳后红球跨过零，变成上旋（旧模型，作废） |
| 0:40–0:51 | 红蓝双球连续三维运动 | 球速、初始旋转、撞台角度和接触状态会改变结果 |
| 0:51–1:00 | 双球和轨迹线 | 空气阻力主要让旋转衰减，重力不会单独造成反转 |
| 1:00–1:15 | 清晰双球三维画面 | 不是所有下旋都会反转，这是当前条件性仿真 |

## 录屏验收

- 三段原始录屏均为 1920×1080 的全屏浏览器画面：`raw/three-d-standard-v10.mov`、`raw/three-d-critical-v10.mov`、`raw/three-d-reversal-v10.mov`。
- 每段画面都包含实际球台、球网、蓝红实体球和轨迹线；抽帧检查通过，球路在网两侧均可见。
- 旧模型的 RPM 数值全部作废；新的基线/临界/过零数值以 `physics-model-audit.md` 为准。
- 音频轨道为单独验证过的 AAC，75.4 秒；采样检查有非零音量，成片同时包含视频轨和音频轨。
- 媒体全部位于仓库外 `/Users/norman/Movies/pingpong-sim/spin-reversal/`，不进入 Git。

## 当前限制

ChatCut 在当前环境不可调用，因此没有声称使用 ChatCut。v09 的女声、SRT 和合成片段只能作为废弃历史素材；重录时必须按新模型重新采集画面、旁白和字幕。发布仍由用户手动完成。
