# v29 媒体清单与可复核验收

状态：已重新生成面向球友的旁白、字幕、横版母版和竖版裁切。媒体全部在仓库外；没有自动发布到乒友群或乒云。

## 文件位置

```text
/Users/norman/Movies/pingpong-sim/spin-reversal/
├── raw/v27/
│   ├── standard-30s.mov
│   ├── critical-30s.mov
│   └── reversal-30s.mov
├── audio/v29/
│   ├── voiceover-xiaoxiao-v29.mp3
│   ├── voiceover-xiaoxiao-v29.vtt
│   └── voiceover-xiaoxiao-v29.txt
└── exports/v29/
    ├── index.html
    ├── pingpong-spin-reversal-master-v29.mp4
    └── pingpong-spin-reversal-vertical-v29.mp4
```

旁白为本机 Edge TTS `zh-CN-XiaoxiaoNeural` 大陆普通话女声，语速 `+8%`。当前成片不依赖 ChatCut；字幕已烧录进两个 MP4，同时保留 VTT 和纯文本稿，便于后续替换声音后重新对齐。横版和竖版都用不透明的球友结果卡覆盖浏览器录屏中的旧内部指标卡，避免旧术语在转场或裁切时漏出。

## 已检查的规格

| 文件 | 画面 | 帧率/解码帧 | 音频 | 时长 |
| --- | --- | --- | --- | --- |
| `raw/v27/standard-30s.mov` | 1920×1080 | 30 fps / 900 | 无 | 30.000 s |
| `raw/v27/critical-30s.mov` | 1920×1080 | 30 fps / 900 | 无 | 30.000 s |
| `raw/v27/reversal-30s.mov` | 1920×1080 | 30 fps / 900 | 无 | 30.000 s |
| `exports/v29/pingpong-spin-reversal-master-v29.mp4` | 1920×1080 | 30 fps / 2678 | 1 条音轨 | 89.267 s |
| `exports/v29/pingpong-spin-reversal-vertical-v29.mp4` | 1080×1920 | 30 fps / 2678 | 1 条音轨 | 89.267 s |

两条 MP4 均已逐帧解码到 2678 帧；横版音轨抽样 RMS `0.097582`、峰值 `0.835443`，确认不是静音。抽帧复核包含标题、三种结果、双球、球网、轨迹、落点提示和字幕；横版、竖版均没有旧的“同一套三维球台/碰撞模型”旁白或指标卡露出。

## 成片中展示的结果

- 常规下旋：蓝 `−854 rpm`，两次落台后仍是下旋。
- 下旋调小：红 `−3 rpm`，第二跳以后接近不转。
- 过零这一档：红 `+84 rpm`，特定条件下第二跳后变上旋。

这些 RPM 是仿真计算值，不是材料实测值。不是所有下旋都会反转；结果受切向摩擦、入射速度、入射角、起手旋转和球台/球的有效接触状态影响。空气阻力主要使旋转衰减，重力不会直接把下旋变成上旋。

## 局域网预览

```text
http://192.168.7.187:8791/
```

预览服务根目录为 `exports/v29/`。发布前仍应在目标平台再次播放检查音量和字幕安全区；本清单不代表平台发布已经完成。
