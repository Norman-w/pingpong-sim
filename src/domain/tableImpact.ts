//#region 常量/配置
export const BALL_RADIUS = 0.020;
export const BALL_MASS = 0.0027;
export const BALL_INERTIA = (2 / 3) * BALL_MASS * BALL_RADIUS ** 2;
// ITTF playing-surface height: 760 mm above the floor. The rendered STL
// assembly is shifted to this same datum in stlLoader.ts.
export const TABLE_TOP = 0.760;
export const TABLE_CONTACT_Y = TABLE_TOP + BALL_RADIUS;
export const RPM_TO_RAD = 2 * Math.PI / 60;

/**
 * Dynamic ball/table friction used by the published contact model. This is a
 * source-backed value for the model's reference table/ball pair, not a
 * universal coefficient for every table surface.
 */
export const TABLE_DYNAMIC_FRICTION = 0.25;
export const TABLE_CONTACT_MODEL_SOURCE =
  'Nature 2026, Outplaying elite table tennis players with an autonomous robot, table-contact model';
export const TABLE_CONTACT_MODEL_SOURCE_URL =
  'https://www.nature.com/articles/s41586-026-10338-5';

/**
 * The three recording labels are different incoming-spin trials. They all use
 * the same source-backed table contact law; none of them pretends that 0.465 or
 * 0.50 is a measured material coefficient.
 */
export const TABLE_IMPACT_PROFILES = {
  'low-grip': {
    id: 'low-grip',
    label: '实测模型·基线',
    frictionCoefficient: TABLE_DYNAMIC_FRICTION,
    note: '参考球台接触模型：μ=0.25；基线入射下旋约 −3200 rpm。',
    source: TABLE_CONTACT_MODEL_SOURCE,
  },
  standard: {
    id: 'standard',
    label: '实测模型·标准',
    frictionCoefficient: TABLE_DYNAMIC_FRICTION,
    note: '参考球台接触模型：μ=0.25；不是某一张球台的通用实测值。',
    source: TABLE_CONTACT_MODEL_SOURCE,
  },
  critical: {
    id: 'critical',
    label: '同一模型·临界初始旋转',
    frictionCoefficient: TABLE_DYNAMIC_FRICTION,
    note: '仍用 μ=0.25，只改变入射下旋到约 −1980 rpm，观察过零门槛。',
    source: TABLE_CONTACT_MODEL_SOURCE,
  },
  'high-grip': {
    id: 'high-grip',
    label: '同一模型·过零初始旋转',
    frictionCoefficient: TABLE_DYNAMIC_FRICTION,
    note: '仍用 μ=0.25，只改变入射下旋到约 −1860 rpm，第二跳过零为上旋。',
    source: TABLE_CONTACT_MODEL_SOURCE,
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
  // Nature's 2026 ball–table model uses the measured velocity-dependent law
  // ε_table = 0.98 − 0.02 v_z⁻, with v_z⁻ in m/s. Do not fade the bounce to
  // zero at low speed: that was an old demo-only heuristic.
  return Math.max(0.05, Math.min(0.98, 0.98 - 0.02 * Math.max(0, impactSpeed)));
}

export function topSpinRpmFromAngularZ(angularZ: number): number {
  // The project convention is positive topRpm => angularVelocity.z < 0.
  return -angularZ / RPM_TO_RAD;
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
