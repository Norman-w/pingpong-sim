//#region 导入/依赖
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
//#endregion

//#region 常量/配置
const TABLE_TOP_Y = 785;
const TABLE_LENGTH = 2740;
const TABLE_WIDTH = 1525;
const TABLE_CENTER_X = TABLE_LENGTH / 2;
const TABLE_CENTER_Z = -TABLE_WIDTH / 2;
const VENUE_LENGTH = 14000;
const VENUE_WIDTH = 7000;
/** Indoor hall ceiling height (mm) — high enough for lob follow camera. */
const CEILING_Y = 4800;
/** Even grid across the full venue so the middle is lit, not only the edges. */
const CEILING_LIGHT_ROWS = 3;
const CEILING_LIGHT_COLS = 4;
//#endregion

//#region 模型/类型
export interface SceneBootstrap {
  canvas: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  CTR: THREE.Vector3;
  TABLE_TOP_Y: number;
  TABLE_LENGTH: number;
  TABLE_WIDTH: number;
  TABLE_CENTER_X: number;
  TABLE_CENTER_Z: number;
  VENUE_LENGTH: number;
  VENUE_WIDTH: number;
}
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
export function createSceneBootstrap(): SceneBootstrap {
  const canvas = document.getElementById('c')!;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141820);
  // Keep fog short of the ceiling so the roof and lamps stay visible when looking up.
  scene.fog = new THREE.Fog(0x141820, 4500, 22000);

  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 1, 30000);
  camera.position.set(4000, 2500, 3500);
  camera.lookAt(1370, 380, -762);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  canvas.appendChild(renderer.domElement);

  addSceneLights(scene);
  addGroundPlane(scene);
  addVenueCeiling(scene);
  addCeilingLights(scene);
  addTableMarkings(scene);
  addVenueBarriers(scene);

  const CTR = new THREE.Vector3(1370, 380, -762);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 500; controls.maxDistance = 12000;
  controls.target.copy(CTR); controls.update();

  return {
    canvas,
    scene,
    camera,
    renderer,
    controls,
    CTR,
    TABLE_TOP_Y,
    TABLE_LENGTH,
    TABLE_WIDTH,
    TABLE_CENTER_X,
    TABLE_CENTER_Z,
    VENUE_LENGTH,
    VENUE_WIDTH,
  };
}
//#endregion

//#region 业务逻辑
function addSceneLights(scene: THREE.Scene): void {
  // Cheap global lights only — per-panel RectArea/Point lights wash the table
  // white and tank frame rate. Ceiling panels are visual glare meshes.
  scene.add(new THREE.AmbientLight(0xd6deea, 5.5));
  scene.add(new THREE.HemisphereLight(0xdce8f3, 0x24272b, 2.2));
  const sun = new THREE.DirectionalLight(0xffeedd, 6.5);
  sun.position.set(1500, 3200, 2000);
  sun.castShadow = false;
  scene.add(sun);
  const overhead = new THREE.DirectionalLight(0xfff4e8, 2.4);
  overhead.position.set(TABLE_CENTER_X, CEILING_Y, TABLE_CENTER_Z);
  overhead.castShadow = false;
  scene.add(overhead);
  scene.add(new THREE.DirectionalLight(0xaaccff, 2.2));
}

function addGroundPlane(scene: THREE.Scene): void {
  const gp = new THREE.Mesh(
    // ITTF-style competition free zone: 14 m × 7 m, with the table centered.
    new THREE.PlaneGeometry(VENUE_LENGTH, VENUE_WIDTH),
    new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.98, metalness: 0 }),
  );
  gp.rotation.x = -Math.PI / 2;
  gp.position.set(TABLE_CENTER_X, -5, TABLE_CENTER_Z);
  gp.receiveShadow = true;
  scene.add(gp);
}

function addVenueCeiling(scene: THREE.Scene): void {
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(VENUE_LENGTH, VENUE_WIDTH),
    new THREE.MeshStandardMaterial({
      color: 0x2a3038,
      roughness: 0.92,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  // Face downward so upward glances see the underside.
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(TABLE_CENTER_X, CEILING_Y, TABLE_CENTER_Z);
  scene.add(ceiling);
}

function addCeilingLights(scene: THREE.Scene): void {
  // Visual-only lamp grid (no real lights per panel — that was overexposing
  // the table and costing ~24 dynamic lights every frame).
  const cellW = VENUE_LENGTH / CEILING_LIGHT_COLS;
  const cellD = VENUE_WIDTH / CEILING_LIGHT_ROWS;
  const panelW = cellW * 0.42;
  const panelD = cellD * 0.38;
  const lampY = CEILING_Y - 80;
  const emissiveMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x3a424c,
    roughness: 0.55,
    metalness: 0.25,
  });
  const x0 = TABLE_CENTER_X - VENUE_LENGTH / 2;
  const z0 = TABLE_CENTER_Z - VENUE_WIDTH / 2;

  for (let row = 0; row < CEILING_LIGHT_ROWS; row++) {
    for (let col = 0; col < CEILING_LIGHT_COLS; col++) {
      const x = x0 + (col + 0.5) * cellW;
      const z = z0 + (row + 0.5) * cellD;

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(panelW + 40, 40, panelD + 40),
        frameMat,
      );
      frame.position.set(x, lampY + 20, z);
      scene.add(frame);

      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(panelW, 18, panelD),
        emissiveMat,
      );
      panel.position.set(x, lampY, z);
      scene.add(panel);
    }
  }
}

function addTableMarkings(scene: THREE.Scene): void {
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f5f2 });
  // The centre line passes beneath the net. Render it above the translucent
  // net cloth so the marking remains continuous on both table halves.
  const centreMaterial = new THREE.MeshBasicMaterial({
    color: 0xf4f5f2,
    depthTest: false,
    depthWrite: false,
  });
  const lineY = TABLE_TOP_Y + 2.2;
  const line = (width: number, depth: number, x: number, z: number, material = lineMaterial): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 3, depth), material);
    mesh.position.set(x, lineY, z);
    mesh.renderOrder = 3;
    scene.add(mesh);
  };
  // 20 mm outside markings, plus the 3 mm doubles centre line.
  line(TABLE_LENGTH, 20, TABLE_CENTER_X, -10);
  line(TABLE_LENGTH, 20, TABLE_CENTER_X, -TABLE_WIDTH + 10);
  line(20, TABLE_WIDTH - 40, 10, TABLE_CENTER_Z);
  line(20, TABLE_WIDTH - 40, TABLE_LENGTH - 10, TABLE_CENTER_Z);
  line(TABLE_LENGTH - 40, 3, TABLE_CENTER_X, TABLE_CENTER_Z, centreMaterial);
}

function addVenueBarriers(scene: THREE.Scene): void {
  const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.82, metalness: 0.05 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x3e4852, roughness: 0.6, metalness: 0.12 });
  const y = 350;
  const xMin = TABLE_CENTER_X - VENUE_LENGTH / 2;
  const xMax = TABLE_CENTER_X + VENUE_LENGTH / 2;
  const zMin = TABLE_CENTER_Z - VENUE_WIDTH / 2;
  const zMax = TABLE_CENTER_Z + VENUE_WIDTH / 2;
  const barriers: Array<[number, number, number, number]> = [
    [VENUE_LENGTH, 38, TABLE_CENTER_X, zMin],
    [VENUE_LENGTH, 38, TABLE_CENTER_X, zMax],
    [38, VENUE_WIDTH, xMin, TABLE_CENTER_Z],
    [38, VENUE_WIDTH, xMax, TABLE_CENTER_Z],
  ];
  for (const [width, depth, x, z] of barriers) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 700, depth), barrierMaterial);
    panel.position.set(x, y, z);
    panel.castShadow = panel.receiveShadow = true;
    scene.add(panel);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(width, 24, depth + 4), trimMaterial);
    trim.position.set(x, y + 350, z);
    scene.add(trim);
  }
}
//#endregion

//#region 方法/工具
//#endregion
