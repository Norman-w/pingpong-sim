//#region 导入/依赖
import * as THREE from 'three';
import {
  createBall,
  clearAllBalls,
  getBalls,
  getBallCount,
  isReady,
  type BallSpinVisual,
  type RapierBall,
} from '../physics';
import type { TableImpactProfile } from '../domain/tableImpact';
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
// The recording stage keeps the physical collider at 20 mm, but enlarges the
// render-only mesh so the two moving comparison balls remain legible in a
// 1920×1080 capture. This does not change any physics or measured trajectory.
const RECORDING_BALL_SCALE = 3.2;
// A plain sphere cannot communicate angular direction in a video. The marker
// is render-only: a bright partial ring and arrowhead rotate with the live
// angular velocity, without changing the Rapier collider or measurements.
const SPIN_MARKER_RADIUS = BALL_RADIUS * 1.13;
const SPIN_MARKER_ARC = Math.PI * 1.55;
const SPIN_MARKER_COLOR = 0xfff2b5;
// The marker follows the measured angular-velocity sign, but is deliberately
// slowed for a 30 fps recording so the arrow direction can be read by eye.
const SPIN_MARKER_SPEED_SCALE = 0.24;
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
    tableImpactProfile?: TableImpactProfile,
  ) => RapierBall | undefined;
  dropBall: () => Promise<void>;
  dropBalls: (n: number) => Promise<void>;
  clearBalls: () => Promise<void>;
  setResetMachineOnClear: (fn: () => void) => void;
  BALL_RADIUS: number;
}
//#endregion

//#region 私有成员
function createRecordingSpinIndicator(): BallSpinVisual & { object3d: THREE.Group } {
  const group = new THREE.Group();
  group.name = 'recording-spin-indicator';
  group.renderOrder = 12;
  // The endline recording camera looks down the table's X axis. A literal
  // Z-axis equator would be edge-on from that view, so use a stable billboard
  // plane while retaining the measured angular-velocity sign for its motion.
  const cameraPlaneGroup = new THREE.Group();
  cameraPlaneGroup.rotation.y = Math.PI / 2;
  group.add(cameraPlaneGroup);
  const spinGroup = new THREE.Group();
  cameraPlaneGroup.add(spinGroup);

  const guideMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.26,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const guideRing = new THREE.Mesh(
    new THREE.TorusGeometry(SPIN_MARKER_RADIUS, 1.4, 6, 64),
    guideMaterial,
  );
  guideRing.renderOrder = 11;
  guideRing.frustumCulled = false;
  spinGroup.add(guideRing);

  const material = new THREE.MeshBasicMaterial({
    color: SPIN_MARKER_COLOR,
    transparent: true,
    opacity: 0.98,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(SPIN_MARKER_RADIUS, 2.6, 8, 48, SPIN_MARKER_ARC),
    material,
  );
  ring.renderOrder = 12;
  ring.frustumCulled = false;
  spinGroup.add(ring);

  const arrowAngle = SPIN_MARKER_ARC;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(5.8, 15, 8), material);
  arrow.position.set(
    SPIN_MARKER_RADIUS * Math.cos(arrowAngle),
    SPIN_MARKER_RADIUS * Math.sin(arrowAngle),
    0,
  );
  // ConeGeometry points along +Y. At the end of this arc, +Y is the tangent.
  arrow.rotation.z = arrowAngle;
  arrow.renderOrder = 13;
  arrow.frustumCulled = false;
  spinGroup.add(arrow);

  const tail = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), material);
  tail.position.set(SPIN_MARKER_RADIUS, 0, 0);
  tail.renderOrder = 13;
  tail.frustumCulled = false;
  spinGroup.add(tail);

  let phase = 0;
  return {
    object3d: group,
    update: (angularVelocity, deltaSeconds) => {
      // The spin-reversal topic uses z as the topspin/backspin axis. Include
      // the other components in the phase so the marker still communicates
      // side/cork spin in a normal recording without changing its geometry.
      const signedRate = angularVelocity.z + angularVelocity.x * 0.35 + angularVelocity.y * 0.15;
      phase += signedRate * Math.max(0, deltaSeconds) * SPIN_MARKER_SPEED_SCALE;
      spinGroup.rotation.z = phase;
      const magnitude = Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z);
      const visibility = Math.min(1, Math.max(0.32, magnitude / 45));
      material.opacity = visibility;
    },
  };
}
//#endregion
//#region 公开 API
export function initBallVisuals(deps: {
  scene: THREE.Scene;
  tableTopY: number;
  onClearMachine?: () => void;
}): BallVisuals {
  const { scene, tableTopY } = deps;
  const recordingSpinDemo = new URLSearchParams(window.location.search).get('recording') === 'spin-reversal';
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
  const recordingMaterials = new Map<number, THREE.MeshBasicMaterial>();

  function recordingMaterial(color: number): THREE.MeshBasicMaterial {
    const existing = recordingMaterials.get(color);
    if (existing) return existing;
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    recordingMaterials.set(color, material);
    return material;
  }

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
    tableImpactProfile?: TableImpactProfile,
  ): RapierBall | undefined {
    const mesh = new THREE.Mesh(
      bGeo,
      recordingSpinDemo ? recordingMaterial(color ?? BALL_WHITE) : ballMaterial,
    );
    const spinVisual = recordingSpinDemo ? createRecordingSpinIndicator() : undefined;
    if (spinVisual) mesh.add(spinVisual.object3d);
    if (recordingSpinDemo) {
      mesh.scale.setScalar(RECORDING_BALL_SCALE);
      mesh.renderOrder = 5;
    }
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const ball = createBall(x, y, z, vx, vy, vz, mesh, tableImpactProfile);
    if (!ball) {
      scene.remove(mesh);
      return undefined;
    }
    ball.spinVisual = spinVisual;
    // Keep the render mesh locked to the rigid body immediately (mm), so the
    // first painted frame is at the nozzle even before the next syncMeshes.
    const p = ball.body.translation();
    const r = ball.body.rotation();
    mesh.position.set(p.x * 1000, p.y * 1000, p.z * 1000);
    mesh.quaternion.set(r.x, r.y, r.z, r.w);
    document.getElementById('bc')!.textContent = String(getBallCount());
    return ball;
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
