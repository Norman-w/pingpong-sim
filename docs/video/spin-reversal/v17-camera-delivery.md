# 旋转反转专题 v17 动态运镜交付

## 交付文件

文件在仓库外，避免把大体积媒体提交到 Git：

```text
/Users/norman/Movies/pingpong-sim/spin-reversal/exports/pingpong-spin-reversal-master-v17.mp4
/Users/norman/Movies/pingpong-sim/spin-reversal/exports/pingpong-spin-reversal-vertical-v18.mp4
```

横版为 1920×1080、30 fps、77.617 秒；竖版为 1080×1920、30 fps、77.617 秒。两条文件各包含 1 条视频轨和 1 条 AAC 音频轨，音频长度约 77.527 秒，抽样解码有非零样本。

画面来源是 `pingpong-sim` 的 Three.js 场景和 Rapier 实时球。成片抽查了开场、标准条件、临界条件、高有效摩擦和结尾段；球、球网、轨迹线、蓝红双球和方向环均可见，横版抽查帧显示相机视角确实发生变化。

## 运镜实现

录屏模式由 `src/features/recordingCamera.ts` 接管相机，8.5 秒一轮：

1. 0–1.9 秒：高位端线全景，建立球台、球网和双球关系。
2. 1.9–3.8 秒：向台面推进并改变目标点，突出两颗球和碰台轨迹。
3.8–5.8 秒：切到另一侧的斜视角，保持第二跳和方向环在画面内。
4. 5.8–7.2 秒：侧后方视角，观察红蓝双球的相对位置。
5. 7.2–8.5 秒：拉回高位全景，准备下一次条件对照。

相机 `position`、`target`、`fov` 使用平滑插值；录屏模式停用 OrbitControls 的更新，避免控制器把关键帧写回静态视角。相机只改变观察方式，不改变物理时间步、碰撞参数或球路。

## 音频和字幕

当前成片沿用仓库外已有普通话音频：

```text
/Users/norman/Movies/pingpong-sim/spin-reversal/audio/voiceover_zh-CN_xiaoxiao_v11.m4a
```

当前环境没有 ChatCut 工具，因此这里不声称使用 ChatCut 生成配音或字幕。横版和竖版均已烧录中文短字幕；如果后续更换配音，应以新音频波形重新对齐字幕，不要直接沿用旧时间码。

## 科学口径

旁白和字卡保持条件性结论：标准条件下旋转减弱但仍为下旋；临界条件接近不转；高有效摩擦示例在当前参数下第二跳后过零为上旋。不是所有下旋都会反转；结果取决于切向摩擦、入射速度、初始旋转和球、台面的有效接触状态。空气阻力主要使旋转衰减，重力不会单独制造反转。RPM 和有效摩擦均标明为仿真计算/示意参数，不是材料实测值。

## 验收边界

- 已完成：动态 Three.js 相机、双球三维画面、横版母版、竖版裁切、字幕、AAC 音轨、分辨率/帧率/轨道/抽帧检查。
- 未执行：ChatCut 轻剪、外部平台发布、乒友群或乒云发布。
- 发布由项目负责人手动完成；原始 `.mov`、音频和导出 MP4 均保留在 `/Users/norman/Movies/pingpong-sim/spin-reversal/`，不进入 Git。
