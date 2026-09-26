//#region 导入/依赖
import {
  BALL_INERTIA,
  BALL_RADIUS,
} from './tableImpact';
//#endregion

//#region 常量/配置
/**
 * Dry air at 293.15 K and 1 atm, matching the CFD source data.
 *
 * Source: Ito & Kamijima, Transaction of the Japan Society for Simulation
 * Technology 17 (2025), DOI 10.11308/tjsst.17.25.
 */
export const AIR_DENSITY = 1.2044;
export const AIR_DYNAMIC_VISCOSITY = 1.814e-5;
export const BALL_AREA = Math.PI * BALL_RADIUS ** 2;
export const BALL_VOLUME = (4 / 3) * Math.PI * BALL_RADIUS ** 3;
export const AERODYNAMICS_SOURCE =
  'Ito & Kamijima 2025, Transaction of the Japan Society for Simulation Technology 17(1), 25–31, DOI 10.11308/tjsst.17.25';

/** The CFD tables are tabulated at these translational speeds and spin rates. */
export const AERO_SPEED_GRID_MPS = [2.5, 5, 10, 15, 17.5, 20] as const;
export const AERO_SPIN_GRID_RPS = [15, 30, 45, 60, 75, 90] as const;

// Rows are 15, 30, 45, 60, 75 and 90 rps; columns are 2.5, 5, 10, 15,
// 17.5 and 20 m/s. Values are copied from Tables 2–5 of Ito & Kamijima
// (2025), not tuned against the current demo.
const DRAG_COEFFICIENT_TABLE = [
  [0.583, 0.498, 0.475, 0.490, 0.493, 0.490],
  [0.620, 0.598, 0.519, 0.507, 0.500, 0.497],
  [0.614, 0.577, 0.560, 0.523, 0.518, 0.510],
  [0.618, 0.578, 0.587, 0.547, 0.536, 0.523],
  [0.602, 0.588, 0.524, 0.568, 0.544, 0.540],
  [0.588, 0.588, 0.510, 0.551, 0.555, 0.548],
] as const;

// The paper reports CL for validation and CM for trajectory integration. The
// CM table is the Magnus coefficient used below with F_M = rho*V*CM*(w×v).
const MAGNUS_COEFFICIENT_TABLE = [
  [0.185, 0.271, 0.246, 0.338, 0.254, 0.291],
  [0.077, 0.168, 0.267, 0.303, 0.288, 0.268],
  [0.061, 0.089, 0.211, 0.251, 0.271, 0.258],
  [0.051, 0.085, 0.140, 0.215, 0.240, 0.245],
  [0.040, 0.075, 0.083, 0.167, 0.195, 0.216],
  [0.035, 0.065, 0.082, 0.114, 0.150, 0.175],
] as const;

const FLUID_TORQUE_COEFFICIENT_TABLE = [
  [1.11e-2, 2.99e-3, 9.42e-4, 5.01e-4, 4.75e-4, 3.80e-4],
  [3.68e-2, 8.09e-3, 2.17e-3, 1.11e-3, 9.31e-4, 7.98e-4],
  [6.92e-2, 1.81e-2, 3.99e-3, 1.95e-3, 1.51e-3, 1.26e-3],
  [1.13e-1, 2.86e-2, 6.80e-3, 3.00e-3, 2.26e-3, 1.82e-3],
  [1.65e-1, 4.04e-2, 1.13e-2, 4.43e-3, 3.27e-3, 2.56e-3],
  [2.23e-1, 5.36e-2, 1.52e-2, 6.58e-3, 4.64e-3, 3.54e-3],
] as const;

export interface AerodynamicCoefficients {
  dragCoefficient: number;
  magnusCoefficient: number;
  fluidTorqueCoefficient: number;
  speedMps: number;
  spinRps: number;
  reynoldsNumber: number;
  clampedToSourceDomain: boolean;
}

export interface AerodynamicForces {
  force: { x: number; y: number; z: number };
  torque: { x: number; y: number; z: number };
  coefficients: AerodynamicCoefficients;
}
//#endregion

//#region 私有成员
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lowerIndex(value: number, grid: readonly number[]): number {
  for (let i = 0; i < grid.length - 1; i += 1) {
    if (value <= grid[i + 1]) return i;
  }
  return grid.length - 2;
}

function bilinear(
  table: readonly (readonly number[])[],
  speedMps: number,
  spinRps: number,
): number {
  const speed = clamp(speedMps, AERO_SPEED_GRID_MPS[0], AERO_SPEED_GRID_MPS.at(-1)!);
  const spin = clamp(spinRps, AERO_SPIN_GRID_RPS[0], AERO_SPIN_GRID_RPS.at(-1)!);
  const si = lowerIndex(speed, AERO_SPEED_GRID_MPS);
  const wi = lowerIndex(spin, AERO_SPIN_GRID_RPS);
  const s0 = AERO_SPEED_GRID_MPS[si];
  const s1 = AERO_SPEED_GRID_MPS[si + 1];
  const w0 = AERO_SPIN_GRID_RPS[wi];
  const w1 = AERO_SPIN_GRID_RPS[wi + 1];
  const ts = s1 === s0 ? 0 : (speed - s0) / (s1 - s0);
  const tw = w1 === w0 ? 0 : (spin - w0) / (w1 - w0);
  const a = table[wi][si];
  const b = table[wi][si + 1];
  const c = table[wi + 1][si];
  const d = table[wi + 1][si + 1];
  return (a * (1 - ts) + b * ts) * (1 - tw) + (c * (1 - ts) + d * ts) * tw;
}
//#endregion

//#region 公开 API
export function aerodynamicCoefficients(
  speedMps: number,
  angularSpeedRadPerSec: number,
): AerodynamicCoefficients {
  const safeSpeed = Math.max(0, speedMps);
  const spinRps = Math.abs(angularSpeedRadPerSec) / (2 * Math.PI);
  const sampledSpeed = clamp(safeSpeed, AERO_SPEED_GRID_MPS[0], AERO_SPEED_GRID_MPS.at(-1)!);
  const sampledSpin = clamp(spinRps, AERO_SPIN_GRID_RPS[0], AERO_SPIN_GRID_RPS.at(-1)!);
  return {
    dragCoefficient: bilinear(DRAG_COEFFICIENT_TABLE, sampledSpeed, sampledSpin),
    magnusCoefficient: bilinear(MAGNUS_COEFFICIENT_TABLE, sampledSpeed, sampledSpin),
    fluidTorqueCoefficient: bilinear(FLUID_TORQUE_COEFFICIENT_TABLE, sampledSpeed, sampledSpin),
    speedMps: sampledSpeed,
    spinRps: sampledSpin,
    reynoldsNumber: (2 * BALL_RADIUS * sampledSpeed * AIR_DENSITY) / AIR_DYNAMIC_VISCOSITY,
    clampedToSourceDomain: safeSpeed !== sampledSpeed || spinRps !== sampledSpin,
  };
}

export function aerodynamicForces(
  velocity: { x: number; y: number; z: number },
  angularVelocity: { x: number; y: number; z: number },
): AerodynamicForces {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const angularSpeed = Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z);
  if (speed < 1e-6 || angularSpeed < 1e-6) {
    const coefficients = aerodynamicCoefficients(speed, angularSpeed);
    const dragScale = speed < 1e-6
      ? 0
      : -0.5 * AIR_DENSITY * coefficients.dragCoefficient * BALL_AREA * speed;
    return {
      force: {
        x: dragScale * velocity.x,
        y: dragScale * velocity.y,
        z: dragScale * velocity.z,
      },
      torque: { x: 0, y: 0, z: 0 },
      coefficients,
    };
  }

  const coefficients = aerodynamicCoefficients(speed, angularSpeed);
  const dragScale = -0.5 * AIR_DENSITY * coefficients.dragCoefficient * BALL_AREA * speed;
  const crossX = angularVelocity.y * velocity.z - angularVelocity.z * velocity.y;
  const crossY = angularVelocity.z * velocity.x - angularVelocity.x * velocity.z;
  const crossZ = angularVelocity.x * velocity.y - angularVelocity.y * velocity.x;
  // F_M = rho * V * C_M * (omega × v), the 3D Magnus model used by the
  // trajectory paper and the Nature table-tennis contact model.
  const magnusScale = AIR_DENSITY * BALL_VOLUME * coefficients.magnusCoefficient;
  const torqueMagnitude = 0.5 * AIR_DENSITY * speed * speed * BALL_AREA * (2 * BALL_RADIUS) * coefficients.fluidTorqueCoefficient;
  const inverseAngularSpeed = 1 / angularSpeed;
  return {
    force: {
      x: dragScale * velocity.x + magnusScale * crossX,
      y: dragScale * velocity.y + magnusScale * crossY,
      z: dragScale * velocity.z + magnusScale * crossZ,
    },
    torque: {
      x: -torqueMagnitude * angularVelocity.x * inverseAngularSpeed,
      y: -torqueMagnitude * angularVelocity.y * inverseAngularSpeed,
      z: -torqueMagnitude * angularVelocity.z * inverseAngularSpeed,
    },
    coefficients,
  };
}

export function integrateAerodynamicSpin(
  angularVelocity: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  dt: number,
): void {
  if (dt <= 0) return;
  const torque = aerodynamicForces(velocity, angularVelocity).torque;
  angularVelocity.x += (torque.x / BALL_INERTIA) * dt;
  angularVelocity.y += (torque.y / BALL_INERTIA) * dt;
  angularVelocity.z += (torque.z / BALL_INERTIA) * dt;
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
