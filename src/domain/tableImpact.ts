//#region 常量/配置
export const BALL_RADIUS = 0.020;
export const BALL_MASS = 0.0027;
export const BALL_INERTIA = (2 / 3) * BALL_MASS * BALL_RADIUS ** 2;
export const TABLE_TOP = 0.785;
export const TABLE_CONTACT_Y = TABLE_TOP + BALL_RADIUS;
export const RPM_TO_RAD = 2 * Math.PI / 60;
// Keep the analytical trajectory and the live Rapier ball on the same small
// angular damping model. This is an explanatory effective parameter, not a
// material measurement of a particular ball or atmosphere.
export const AIR_SPIN_DECAY_RATE = 0.015;

/**
 * These are effective contact profiles for an explanatory simulation. They
 * are not material measurements for every ball, table, or rubber sheet.
 */
export const TABLE_IMPACT_PROFILES = {
  'low-grip': {
    id: 'low-grip',
    label: '低有效摩擦',
    frictionCoefficient: 0.14,
    note: '旋转主要减弱，台面传给球的切向冲量较小。',
  },
  standard: {
    id: 'standard',
    label: '标准条件',
    frictionCoefficient: 0.25,
    note: '采用当前仿真的基准有效摩擦。',
  },
  critical: {
    id: 'critical',
    label: '临界条件',
    frictionCoefficient: 0.465,
    note: '配合当前空气旋转阻尼时，第二跳前后接近旋转过零。',
  },
  'high-grip': {
    id: 'high-grip',
    label: '高有效摩擦',
    frictionCoefficient: 0.50,
    note: '切向冲量足够大时，旋转可能过零并反向。',
  },
} as const;

export type TableImpactProfile = typeof TABLE_IMPACT_PROFILES[keyof typeof TABLE_IMPACT_PROFILES];
export type TableImpactProfileId = keyof typeof TABLE_IMPACT_PROFILES;

export type SpinSense = 'backspin' | 'neutral' | 'topspin';

export interface ImpactKinematics {
  linearVelocity: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
}

export interface TableImpactEvent {
  impactSpeed: number;
  restitution: number;
  normalImpulse: number;
  tangentialImpulse: number;
  contactVx: number;
  contactVz: number;
  frictionLimited: boolean;
  beforeTopSpinRpm: number;
  afterTopSpinRpm: number;
  beforeSense: SpinSense;
  afterSense: SpinSense;
  spinReversed: boolean;
}
//#endregion

//#region 模型/类型
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
export function tableRestitution(impactSpeed: number): number {
  const calibratedRestitution = Math.max(0.55, Math.min(0.90, 0.93 - 0.02 * impactSpeed));
  const lowSpeedRatio = Math.max(0, Math.min(1, (impactSpeed - 0.005) / (0.30 - 0.005)));
  const lowSpeedElasticity = lowSpeedRatio * lowSpeedRatio * (3 - 2 * lowSpeedRatio);
  return calibratedRestitution * lowSpeedElasticity;
}

export function topSpinRpmFromAngularZ(angularZ: number): number {
  // The project convention is positive topRpm => angularVelocity.z < 0.
  return -angularZ / RPM_TO_RAD;
}

export function applyAirSpinDamping(
  angularVelocity: { x: number; y: number; z: number },
  dt: number,
): void {
  if (dt <= 0) return;
  const decay = Math.exp(-AIR_SPIN_DECAY_RATE * dt);
  angularVelocity.x *= decay;
  angularVelocity.y *= decay;
  angularVelocity.z *= decay;
}

export function classifySpin(topSpinRpm: number, neutralBandRpm = 25): SpinSense {
  if (Math.abs(topSpinRpm) <= neutralBandRpm) return 'neutral';
  return topSpinRpm > 0 ? 'topspin' : 'backspin';
}

export function resolveTableImpactKinematics(
  kinematics: ImpactKinematics,
  profile: TableImpactProfile = TABLE_IMPACT_PROFILES.standard,
): { kinematics: ImpactKinematics; event: TableImpactEvent } {
  const { linearVelocity: v, angularVelocity: w } = kinematics;
  const impactSpeed = Math.max(0, -v.y);
  const restitution = tableRestitution(impactSpeed);
  const contactVx = v.x + w.z * BALL_RADIUS;
  const contactVz = v.z - w.x * BALL_RADIUS;
  const contactSpeed = Math.hypot(contactVx, contactVz);
  const normalImpulse = BALL_MASS * (1 + restitution) * impactSpeed;
  const stickingImpulse = 0.4 * BALL_MASS * contactSpeed;
  const frictionLimit = profile.frictionCoefficient * normalImpulse;
  const tangentialImpulse = Math.min(stickingImpulse, frictionLimit);
  const frictionLimited = stickingImpulse > frictionLimit + 1e-12;
  const impulseX = contactSpeed > 1e-6 ? -tangentialImpulse * contactVx / contactSpeed : 0;
  const impulseZ = contactSpeed > 1e-6 ? -tangentialImpulse * contactVz / contactSpeed : 0;
  const nextAngularVelocity = {
    x: w.x - BALL_RADIUS * impulseZ / BALL_INERTIA,
    y: w.y,
    z: w.z + BALL_RADIUS * impulseX / BALL_INERTIA,
  };
  const beforeTopSpinRpm = topSpinRpmFromAngularZ(w.z);
  const afterTopSpinRpm = topSpinRpmFromAngularZ(nextAngularVelocity.z);
  const beforeSense = classifySpin(beforeTopSpinRpm);
  const afterSense = classifySpin(afterTopSpinRpm);

  return {
    kinematics: {
      linearVelocity: {
        x: v.x + impulseX / BALL_MASS,
        // The resolver is normally called on a downward crossing. Preserve
        // an upward/non-impact input if a caller invokes it defensively.
        y: impactSpeed > 0 ? impactSpeed * restitution : v.y,
        z: v.z + impulseZ / BALL_MASS,
      },
      angularVelocity: nextAngularVelocity,
    },
    event: {
      impactSpeed,
      restitution,
      normalImpulse,
      tangentialImpulse,
      contactVx,
      contactVz,
      frictionLimited,
      beforeTopSpinRpm,
      afterTopSpinRpm,
      beforeSense,
      afterSense,
      spinReversed: beforeSense !== 'neutral' && afterSense !== 'neutral' && beforeSense !== afterSense,
    },
  };
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
