# v27 媒体清单与可复核验收

状态：已在本机完成横版母版、竖版裁切和局域网预览。媒体均放在仓库外，不进入 Git；未自动发布到任何群或平台。

## 文件位置

```text
/Users/norman/Movies/pingpong-sim/spin-reversal/
├── raw/v27/
│   ├── standard-30s.mov
│   ├── critical-30s.mov
│   └── reversal-30s.mov
├── audio/v27/
│   ├── voiceover-xiaoxiao-v27.mp3
│   ├── voiceover-xiaoxiao-v27.vtt
│   └── voiceover-xiaoxiao-v27.txt
└── exports/v27/
    ├── index.html
    ├── pingpong-spin-reversal-master-v27.mp4
    └── pingpong-spin-reversal-vertical-v27.mp4
```

旁白使用本机 Edge TTS 的 `zh-CN-XiaoxiaoNeural` 大陆普通话女声，语速为 `+8%`；它不是 ChatCut 或付费配音。字幕已烧录到两个 MP4，同时保留 VTT 交接稿，便于后续替换声音时重新对齐。

## 已检查的规格

| 文件 | 画面 | 帧率/解码帧 | 音频 | 时长 |
| --- | --- | --- | --- | --- |
| `raw/v27/standard-30s.mov` | 1920×1080 | 30 fps / 900 | 无 | 30.000 s |
| `raw/v27/critical-30s.mov` | 1920×1080 | 30 fps / 900 | 无 | 30.000 s |
| `raw/v27/reversal-30s.mov` | 1920×1080 | 30 fps / 900 | 无 | 30.000 s |
| `exports/v27/pingpong-spin-reversal-master-v27.mp4` | 1920×1080 | 30 fps / 2678 | 1 条音轨 | 89.267 s |
| `exports/v27/pingpong-spin-reversal-vertical-v27.mp4` | 1080×1920 | 30 fps / 2678 | 1 条音轨 | 89.267 s |

抽帧复核包含标题、标准/临界/过零数据卡、双球、球网、轨迹和碰台提示环；关键时段没有将“跨过零点”的旁白放在空白画面上。局域网预览页由本机 HTTP 服务提供：

```text
http://192.168.7.187:8789/
```

## 科学口径

- 标准原片读数：蓝球 `-854 rpm`、红球 `-854 rpm`，两次落台后仍为下旋。
- 临界原片读数：红球 `-3 rpm`，第二跳后接近不转。
- 过零原片读数：红球 `+84 rpm`，第二跳后在当前参数下为上旋。
- 这些 RPM 是仿真计算值；是否反转取决于切向摩擦、入射速度、入射角、初始旋转，以及球和台面的有效接触状态。
- 空气阻力主要使旋转衰减，重力影响落台冲击；二者不会单独把下旋变成上旋。

发布前仍应在目标平台再次播放检查音量和字幕安全区；本清单不代表平台发布已经完成。
