//#region 导入/依赖
import * as THREE from 'three';
//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
/** Force recording sample 0 onto the machine nozzle origin used at feed time. */
export function snapRecordingLaunchToOrigin(
  recording: { time: number; position: THREE.Vector3 }[],
  originMm: THREE.Vector3,
): void {
  if (recording.length === 0) return;
  recording[0].time = 0;
  recording[0].position.copy(originMm);
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
