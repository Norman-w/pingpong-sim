# v43 横版母版交接记录

本版针对碰台瞬间的相互摩擦、力的方向和旁白重点路线做了修正。碰撞提示直接使用 `TableImpactEvent.contactVx/contactVz`：橙色箭头表示台面对球的切向摩擦冲量，绿色箭头表示球对台面的相反作用，黄色箭头表示台面向上的法向冲量；环形落点和黄色擦动线用于标出实际接触区域。

## ChatCut 工程

- 项目：`乒乓球旋转科普｜下旋球碰台后会不会变成上旋？`
- 时间线：`横版母版 v43｜重点路线与受力方向修正版`
- 时间线 ID：`afa799a1-c9fc-4aff-b02f-c8faecd040c2`
- 合成规格：1920×1080，30 fps 时间线；导出按 60 fps
- 旁白：既有的 ChatCut“流畅女声”普通话轨道，未改动台词

视频切点按旁白对齐：标准条件 `[0,338)` 帧（0–11.27 秒），临界条件 `[338,651)` 帧（11.27–21.70 秒），过零和受力展示从第 651 帧开始，结尾到第 1650 帧。标准段右上卡片强调蓝球；临界和过零段强调红球，事件卡同时保留实际碰台球名及碰撞前后 RPM。

## 素材与成片

- 60 fps 源片目录：`/Users/norman/Movies/pingpong-sim/spin-reversal/raw/v42-native60/`
- 成片：`/Users/norman/Movies/pingpong-sim/spin-reversal/exports/chatcut/spin-reversal-horizontal-v43-focus-force60.mp4`
- 局域网预览：`http://192.168.7.187:8777/spin-reversal/exports/chatcut/spin-reversal-horizontal-v43-focus-force60.mp4`

成片实测为 55 秒、1920×1080、60 fps、3300 个视频帧，包含 H.264 视频和 AAC 音频；用 AVAssetReader 全量解码通过。原始 PNG、源片和 MP4 均在仓库外，未进入 Git。录制用的专用 Chrome 端口 9222–9224 在录制结束后已关闭。

## 科学口径

本片仍保持条件性结论：不是所有下旋都会变成上旋；结果取决于入射速度、入射角、初始旋转、碰撞时切向摩擦以及球和台面的有效接触状态。空气阻力主要使旋转衰减，重力影响落台冲击，但不直接把下旋变成上旋。RPM 和 μ=0.25 都标为仿真/来源接触模型值，不冒充手边球台材料的现场实测。
