# v41 横版正式交接

v41 使用 `pingpong-sim` 的无窗口 CDP 逐帧录制源片，ChatCut Desktop 正式项目和官方流畅女声旁白完成了横版合成。原始 PNG、源片、音频和导出文件都在仓库外，不进入 Git。

## 已检查文件

- 标准条件源片：`/Users/norman/Movies/pingpong-sim/spin-reversal/raw/v40-native60/standard-60fps.mp4`
- 临界条件源片：`/Users/norman/Movies/pingpong-sim/spin-reversal/raw/v40-native60/critical-60fps.mp4`
- 过零条件源片：`/Users/norman/Movies/pingpong-sim/spin-reversal/raw/v40-native60/reversal-60fps.mp4`
- ChatCut 官方流畅女声：`/Users/norman/Movies/pingpong-sim/spin-reversal/audio/v40/voiceover-liuchang-v40.mp3`
- 横版导出：`/Users/norman/Movies/pingpong-sim/spin-reversal/exports/chatcut/spin-reversal-horizontal-v41-fluent60.mp4`
- 字幕文件：`/Users/norman/Movies/pingpong-sim/spin-reversal/exports/chatcut/spin-reversal-horizontal-v41-fluent.srt`

横版导出独立检查结果：1920×1080、60 fps、55 秒、H.264 + AAC；视频 3300 帧，连续相邻帧没有完全重复帧；音轨峰值约 −9.8 dB、平均约 −24.3 dB。局域网预览地址：

`http://192.168.7.187:8777/spin-reversal/exports/chatcut/spin-reversal-horizontal-v41-fluent60.mp4`

## ChatCut 时间线

项目：`乒乓球旋转科普｜下旋球碰台后会不会变成上旋？`

时间线：`横版 v41｜原生60fps｜流畅女声正式版`，1920×1080，编辑时间线 55 秒。画面按标准、临界、过零/机制、结论排列，旁白由 ChatCut 转写生成 `submagic` 逐词字幕。没有沿用旧的 90 秒尾段、旧的慢放素材或旧的受力动效，因此不会把旧条件和新源片混在一起。

科学口径保持条件性：空气阻力主要使旋转衰减，重力影响碰撞但不单独造成反转；是否过零取决于入射速度、入射角、初始旋转、碰撞切向摩擦以及球和台面的有效接触状态。`μ=0.25` 只是来源接触模型参数，不是现场材料实测值。

## 播放与窗口约束

CDP 录制使用临时 headless Chrome，不需要前台窗口；脚本在 `finally` 中关闭 WebSocket、终止 Chrome 进程组并删除临时 profile。当前用于录制的专用 Chrome 实例和调试端口已经关闭。8777 端口只提供仓库外媒体的局域网 HTTP 预览，不参与录制。
