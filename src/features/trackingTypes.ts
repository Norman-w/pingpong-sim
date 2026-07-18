//#region 导入/依赖
import * as THREE from 'three';
import type { RapierBall } from '../physics';

//#endregion

//#region 常量/配置
//#endregion
//#region 模型/类型
export type TrackingPhase =
  | 'follow-launch'
  | 'look-back'
  | 'reacquire'
  | 'follow-contact'
  | 'contact-hold'
  | 'post-contact-source';

export interface TrackingSession {
  ball: RapierBall;
  phase: TrackingPhase;
  phaseStartedAt: number;
  startedAt: number;
  previousVy: number;
  apexPoint: THREE.Vector3;
  actualPoint: THREE.Vector3;
  closestPoint: THREE.Vector3;
  closestDistance: number;
  contactFailed: boolean;
}

export interface TrackingSnapshot {
  time: number;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
}

export type IncomingSourceKind = 'machine' | 'opponent-contact';

export interface IncomingSource {
  kind: IncomingSourceKind;
  label: string;
  note: string;
  position: () => THREE.Vector3;
}
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
