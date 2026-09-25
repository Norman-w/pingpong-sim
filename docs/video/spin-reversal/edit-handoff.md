# 横版母版、竖版裁切与媒体交接

## 媒体目录

所有原始录屏、配音、剪辑工程和导出视频放在仓库外：

```text
/Users/norman/Movies/pingpong-sim/spin-reversal/
├── raw/       # 浏览器原始录屏，按 S01–S08 命名
├── audio/     # 普通话配音、音乐（如有）、字幕中间文件
├── project/   # ChatCut 原生工程或工程包
└── exports/   # 经过检查的横版和竖版 MP4
```

建议输出名：

```text
exports/spin-reversal-master-1920x1080-v01.mp4
exports/spin-reversal-vertical-1080x1920-v01.mp4
audio/narration_zh-CN_neutral_v01.wav
audio/spin-reversal-v01.srt
```

## 横版母版

- 画布 1920×1080，30 fps；目标时长约 90 秒。
- 片头 8 秒使用标题层；标准、临界、反转三段按 S02–S05 顺序排列。
- 数据卡至少停留 4 秒，给出标准 2304→1644→1087 rpm、临界 2304→1064→约 10 rpm、高有效摩擦 2304→985→上旋 121 rpm，并标注“仿真计算值”。
- 慢放段只把第二跳前后放大或定格，不把网页自动回放描述成可交互的媒体暂停功能。
- 字幕保持在安全区，避免遮挡球台、网和 RPM 卡片；重要结论同时使用短字卡和旁白。

## 竖版裁切

- 画布 1080×1920，30 fps；不直接把横版缩小后加黑边。
- 以球和第二跳为中心重新取景，必要时拆成“标准/临界”和“反转/数据”两段画面。
- 标题、RPM 数据和条件性结论重新排版到上下安全区；不让竖版裁切掉网、落台位置或“仅代表当前仿真参数”提示。
- 竖版字幕重新检查换行，单条不超过两行；最终时间码以实际配音为准。

## 当前导出状态

当前环境没有可调用的 ChatCut 插件或页面，因此没有声称使用 ChatCut 完成剪辑。已经用本机原生 AVFoundation 将旁白与动态科普画面合成为可播放的横版 MP4，文件位于仓库外：

```text
/Users/norman/Movies/pingpong-sim/spin-reversal/exports/spin-reversal-master-1920x1080-v01.mp4
```

已验收：H.264 视频、MPEG-4 AAC 音频、1920×1080、30 fps、约 92.9 秒；解码得到 2787 帧，多个时间点的画面校验值不同，说明画面确实在运动；音频轨道约 92.8 秒。浏览器播放器中取消静音后，视频从 `currentTime=0` 推进到约 `1.7` 秒，`muted=false`、`readyState=4`。

旁白原始文本、AIFF 和 AAC/M4A 中间文件位于 `audio/`；大体积视频和音频均不进入 Git。若后续 ChatCut 可用，可把该 MP4 作为当前可发布母版或重新导入 `raw/` 的分镜素材，按下方规格重构竖版；当前没有声称已经生成竖版或完成平台发布。

## 局域网观看入口

开发服务监听 `0.0.0.0:5174` 时，局域网设备可以直接打开：

```text
http://192.168.7.187:5174/pingpong-sim/?recording=spin-reversal&mode=reversal
```

这个地址会自动进入干净舞台、发射标准/高有效摩擦双球并启动自动慢放。要看临界条件，把 `mode=reversal` 改为 `mode=critical`；不带 `recording` 参数时仍是普通交互页面。设备需要与这台 Mac 位于同一局域网，且 Mac 防火墙允许 TCP 5174。

播放器目录由另一个局域网静态服务提供。当前页面直接播放带旁白的横版 MP4：

```sh
python3 -m http.server 5175 --bind 0.0.0.0 \
  --directory /Users/norman/Movies/pingpong-sim/spin-reversal
```

播放器地址：`http://192.168.7.187:5175/`。页面使用 `<video controls>` 播放 `exports/spin-reversal-master-1920x1080-v01.mp4`。该文件已经具备音画，可直接下载后在支持 H.264/AAC 的平台上传；发布仍由您手动完成。

仓库外仍保留早期 canvas WebM 验证片段，但它没有旁白，不应作为最终交付：`exports/spin-reversal-lan-canvas-v01.webm`。带 `capture=webm` 的仿真入口仍可在支持 `MediaRecorder` 的真实 Chrome 中录制新的 WebM：

```text
http://192.168.7.187:5174/pingpong-sim/?recording=spin-reversal&mode=reversal&capture=webm
```

不要把 WebM 验证片段误报成最终成片，也不要自动发布到乒友群或乒云。
