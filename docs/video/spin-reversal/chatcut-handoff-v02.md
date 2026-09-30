# ChatCut 交接包 v02（历史包）

本文件记录的是 ChatCut 尚不可用时的准备包，已被当前 Desktop 工程 v41 取代。当前横版导出、字幕和独立验收记录见 [`v41-delivery.md`](v41-delivery.md)；不要把下面的“未导出”状态当作当前状态。

仓库外交接包位于：

```text
/Users/norman/Movies/pingpong-sim/spin-reversal/project/chatcut-handoff-v02/
```

包内内容：

- `README.md`：导入顺序、配音约束、横竖版规格和导出验收；
- `voiceover_zh-CN_v02.txt`：短句普通话旁白，不自动扩写；
- `captions_v02.srt`：初始字幕时间码，需按实际配音波形微调；
- `shot-list_v02.md`：七个镜头的录制、剪辑和质量门槛；
- `metrics-card.md`：来源模型基线、临界初始旋转、过零初始旋转三行仿真数据卡；必须标注 `μ=0.25` 和空气 CFD 来源域。

目标是 60–65 秒的干净横版母版，再单独重构竖版。只有真实录屏、旁白、字幕、音画同步和导出文件都验收后，才报告 MP4 完成。发布仍由项目负责人手动完成。
