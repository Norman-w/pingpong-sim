//#region 导入/依赖
import * as THREE from 'three';
import { CONTACT_TECHNIQUES } from './contactRules';
//#endregion

//#region 常量/配置
export const NET_X_MM = 1370;
//#endregion

//#region 模型/类型
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
/** Feet depth for chasing a lob bounce before window-B retreat takes over. */
export function lobSmashStanceX(bounceXMm: number): number {
  const forwardMm = CONTACT_TECHNIQUES.smash.forwardMm;
  return THREE.MathUtils.clamp(bounceXMm + forwardMm + 280, 2650, 3800);
}

/** Soft-chase lateral target while the lob approaches / clears the net. */
export function lobChaseContactZ(args: {
  ballZMm: number;
  velocityZMps: number;
  intendedLandingZMm: number;
  hasBounced: boolean;
  zMin: number;
  zMax: number;
}): number {
  const predictedZ = args.hasBounced
    ? args.ballZMm + args.velocityZMps * 1000 * 0.25
    : args.intendedLandingZMm;
  return THREE.MathUtils.clamp(predictedZ, args.zMin, args.zMax);
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
