//#region 导入/依赖
//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
export {
  PLAYER_LEVELS,
  RUBBER_PROFILES,
  SHOT_CATEGORIES,
  SHOT_PRESETS,
  getPreset,
  getShotKnowledge,
  type BallLength,
  type BallStyle,
  type LaunchQuality,
  type LaunchSolution,
  type MachineSettings,
  type PlayerLevel,
  type RubberKey,
  type RubberProfile,
  type ShotCategory,
  type ShotKnowledge,
  type ShotOutcome,
  type ShotPreset,
  type TargetLane,
} from './domain/shotCatalog';

export {
  solveLaunch,
} from './domain/launchSolver';

export {
  sampleTrajectory,
  sampleTrajectoryDetails,
  type SampledTrajectory,
} from './domain/trajectorySim';
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
