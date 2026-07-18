//#region 导入/依赖
import * as THREE from 'three';
import {
  createBall,
  clearAllBalls,
  getBalls,
  getBallCount,
  isReady,
  type RapierBall,
} from '../physics';
import { type BallStyle } from '../serveMachine';
//#endregion

//#region 常量/配置
const BALL_OCTANT_COLORS = [
  0xf8fafc, 0xff9f43, 0x54d6ff, 0xffd166,
  0x5ee6a8, 0xff5d73, 0xa66cff, 0x4d96ff,
];
const BALL_WHITE = 0xf8fafc;
const BALL_YELLOW = 0xffdf32;
const BALL_RADIUS = 20;
const STANDARD_DROP_HEIGHT = 300;
const SPX = 2055;
const SPZ = -762;
//#endregion

//#region 模型/类型
export interface BallVisuals {
  bGeo: THREE.SphereGeometry;
  ballMaterial: THREE.MeshBasicMaterial;
  machineBallMeta: Map<any, { presetId: string; countedLanding: boolean; isOpeningServe: boolean; shownImpactCount: number }>;
  setBallStyle: (style: BallStyle) => void;
  spawnPhysicsBall: (
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    color?: number,
  ) => RapierBall | undefined;
  dropBall: () => Promise<void>;
  dropBalls: (n: number) => Promise<void>;
  clearBalls: () => Promise<void>;
  setResetMachineOnClear: (fn: () => void) => void;
  BALL_RADIUS: number;
}
//#endregion

//#region 私有成员
//#endregion
//#region 公开 API
export function initBallVisuals(deps: {
  scene: THREE.Scene;
  tableTopY: number;
  onClearMachine?: () => void;
}): BallVisuals {
  const { scene, tableTopY } = deps;
  let resetMachineOnClear = deps.onClearMachine ?? ((): void => {});

  const bGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32).toNonIndexed() as THREE.SphereGeometry;

  const BALL_STYLE_PALETTES: Record<BallStyle, number[]> = {
    white: Array(8).fill(BALL_WHITE),
    yellow: Array(8).fill(BALL_YELLOW),
    'white-yellow-split': Array.from({ length: 8 }, (_, octant) => octant >= 4 ? BALL_YELLOW : BALL_WHITE),
    'white-yellow-eight': Array.from({ length: 8 }, (_, octant) => {
      const parity = ((octant >> 2) & 1) ^ ((octant >> 1) & 1) ^ (octant & 1);
      return parity ? BALL_YELLOW : BALL_WHITE;
    }),
    rainbow: BALL_OCTANT_COLORS,
  };

  const ballPosition = bGeo.getAttribute('position');
  const ballColors = new Float32Array(ballPosition.count * 3);
  const ballOctants = new Uint8Array(ballPosition.count / 3);
  const faceA = new THREE.Vector3();
  const faceB = new THREE.Vector3();
  const faceC = new THREE.Vector3();
  const faceCentre = new THREE.Vector3();
  for (let offset = 0; offset < ballPosition.count; offset += 3) {
    faceA.fromBufferAttribute(ballPosition, offset);
    faceB.fromBufferAttribute(ballPosition, offset + 1);
    faceC.fromBufferAttribute(ballPosition, offset + 2);
    faceCentre.copy(faceA).add(faceB).add(faceC).multiplyScalar(1 / 3);
    const octant = (faceCentre.x >= 0 ? 4 : 0) + (faceCentre.y >= 0 ? 2 : 0) + (faceCentre.z >= 0 ? 1 : 0);
    ballOctants[offset / 3] = octant;
    const color = new THREE.Color(BALL_STYLE_PALETTES.rainbow[octant]);
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const index = (offset + vertex) * 3;
      ballColors[index] = color.r;
      ballColors[index + 1] = color.g;
      ballColors[index + 2] = color.b;
    }
  }
  bGeo.setAttribute('color', new THREE.Float32BufferAttribute(ballColors, 3));

  const ballMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });

  function setBallStyle(style: BallStyle): void {
    const palette = BALL_STYLE_PALETTES[style] ?? BALL_STYLE_PALETTES.rainbow;
    const color = new THREE.Color();
    for (let face = 0; face < ballOctants.length; face += 1) {
      color.setHex(palette[ballOctants[face]]);
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const index = (face * 3 + vertex) * 3;
        ballColors[index] = color.r;
        ballColors[index + 1] = color.g;
        ballColors[index + 2] = color.b;
      }
    }
    const colorAttribute = bGeo.getAttribute('color') as THREE.BufferAttribute;
    colorAttribute.copyArray(ballColors);
    colorAttribute.needsUpdate = true;
    ballMaterial.needsUpdate = true;
  }

  const machineBallMeta = new Map<any, { presetId: string; countedLanding: boolean; isOpeningServe: boolean; shownImpactCount: number }>();

  function spawnPhysicsBall(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    color?: number,
  ): RapierBall | undefined {
    const mesh = new THREE.Mesh(bGeo, ballMaterial);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const ball = createBall(x, y, z, vx, vy, vz, mesh);
    if (!ball) scene.remove(mesh);
    document.getElementById('bc')!.textContent = String(getBallCount());
    return ball ?? undefined;
  }

  async function dropBall(): Promise<void> {
    if (!isReady()) return;

    const x = SPX + (Math.random() - 0.5) * 200;
    // ITTF table calibration drop: 300 mm from the ball's underside to the table.
    const y = tableTopY + BALL_RADIUS + STANDARD_DROP_HEIGHT;
    const z = SPZ + (Math.random() - 0.5) * 300;

    // A drop starts from rest. Random launch velocity/spin makes a calibration
    // drop curve in the air and is not part of natural free fall.
    spawnPhysicsBall(x, y, z, 0, 0, 0);
  }

  async function dropBalls(n: number): Promise<void> {
    for (let i = 0; i < n; i++) setTimeout(() => dropBall(), i * 200);
  }

  async function clearBalls(): Promise<void> {
    resetMachineOnClear();
    for (const b of getBalls()) scene.remove(b.mesh);
    clearAllBalls();
    machineBallMeta.clear();
    document.getElementById('bc')!.textContent = '0';
  }

  Object.assign(window, { dropBall, dropBalls, clearBalls });

  return {
    bGeo,
    ballMaterial,
    machineBallMeta,
    setBallStyle,
    spawnPhysicsBall,
    dropBall,
    dropBalls,
    clearBalls,
    setResetMachineOnClear: (fn: () => void) => { resetMachineOnClear = fn; },
    BALL_RADIUS,
  };
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
