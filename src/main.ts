import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { createIcons, MousePointer2, ArrowDown, X } from 'lucide';
import { init as initPhysics, isReady, createBall, removeBall, clearAllBalls, getBalls, step as physicsStep, syncMeshes, getBallCount, type RapierBall } from './physics';
import {
  SHOT_CATEGORIES,
  SHOT_PRESETS,
  PLAYER_LEVELS,
  getPreset,
  sampleTrajectory,
  solveLaunch,
  type LaunchSolution,
  type BallStyle,
  type MachineSettings,
  type PlayerLevel,
  type ShotPreset,
  type TargetLane,
} from './serveMachine';

createIcons({ icons: { MousePointer2, ArrowDown, X } });

// ==================== Scene ====================
const c = document.getElementById('c')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 3000, 20000);

const camera = new THREE.PerspectiveCamera(45, c.clientWidth / c.clientHeight, 1, 30000);
camera.position.set(4000, 2500, 3500);
camera.lookAt(1370, 380, -762);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(c.clientWidth, c.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
c.appendChild(renderer.domElement);

// Broad, soft environment illumination keeps the table and balls readable
// without a bright point-like source appearing at the top of the scene.
scene.add(new THREE.AmbientLight(0xd6deea, 7));
scene.add(new THREE.HemisphereLight(0xdce8f3, 0x24272b, 2.5));
const sun = new THREE.DirectionalLight(0xffeedd, 8);
sun.position.set(1500, 3000, 2000);
// Keep a broad directional fill for form, but do not cast the small hard
// overhead shadow that made the old top light read like a point lamp.
sun.castShadow = false;
scene.add(sun);
scene.add(new THREE.DirectionalLight(0xaaccff, 3));

const TABLE_TOP_Y = 785;
const gp = new THREE.Mesh(
  // ITTF-style competition free zone: 14 m × 7 m, with the table centered.
  new THREE.PlaneGeometry(14000, 7000),
  new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.98, metalness: 0 }),
);
gp.rotation.x = -Math.PI / 2; gp.position.set(1370, -5, -762.5);
gp.receiveShadow = true; scene.add(gp);

const TABLE_LENGTH = 2740;
const TABLE_WIDTH = 1525;
const TABLE_CENTER_X = TABLE_LENGTH / 2;
const TABLE_CENTER_Z = -TABLE_WIDTH / 2;
const VENUE_LENGTH = 14000;
const VENUE_WIDTH = 7000;

function addTableMarkings(): void {
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

function addVenueBarriers(): void {
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

addTableMarkings();
addVenueBarriers();

const CTR = new THREE.Vector3(1370, 380, -762);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 500; controls.maxDistance = 12000;
controls.target.copy(CTR); controls.update();

type ViewStance = 'near' | 'mid' | 'far' | 'forehand' | 'middle' | 'backhand';
const VIEW_STANCES: Record<ViewStance, { x: number; z: number; label: string }> = {
  near: { x: 3050, z: -762.5, label: '近台' },
  mid: { x: 3600, z: -762.5, label: '中台' },
  far: { x: 4500, z: -762.5, label: '远台' },
  forehand: { x: 3300, z: -1305, label: '正手位' },
  middle: { x: 3300, z: -762.5, label: '中路' },
  backhand: { x: 3300, z: -220, label: '反手位' },
};
let viewHeightMm = 1600;
let viewStance: ViewStance = 'mid';

function applyViewPreset(): void {
  const stance = VIEW_STANCES[viewStance];
  camera.position.set(stance.x, viewHeightMm, stance.z);
  controls.target.set(TABLE_CENTER_X, TABLE_TOP_Y + 180, TABLE_CENTER_Z);
  controls.update();
  document.querySelectorAll<HTMLButtonElement>('[data-view-height]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.viewHeight) === viewHeightMm);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-view-stance]').forEach(button => {
    button.classList.toggle('active', button.dataset.viewStance === viewStance);
  });
}

document.querySelectorAll<HTMLButtonElement>('[data-view-height]').forEach(button => {
  button.addEventListener('click', () => {
    viewHeightMm = Number(button.dataset.viewHeight);
    applyViewPreset();
    updateContactGuide();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-view-stance]').forEach(button => {
  button.addEventListener('click', () => {
    viewStance = button.dataset.viewStance as ViewStance;
    applyViewPreset();
    updateContactGuide();
  });
});

// ==================== Balls ====================
const bGeo = new THREE.SphereGeometry(20, 32, 32).toNonIndexed();

// Three mutually perpendicular cuts split the ball into eight octants. The
// octants use eight distinct colours, including one white section. This keeps
// the three-cut boundaries visually interleaved instead of reading as one
// white hemisphere and one coloured hemisphere.
const BALL_OCTANT_COLORS = [
  0xf8fafc, 0xff9f43, 0x54d6ff, 0xffd166,
  0x5ee6a8, 0xff5d73, 0xa66cff, 0x4d96ff,
];
const BALL_WHITE = 0xf8fafc;
const BALL_YELLOW = 0xffdf32;
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
  // Copy into the live GPU attribute and invalidate the material program so
  // existing meshes change immediately, not only balls spawned afterwards.
  colorAttribute.copyArray(ballColors);
  colorAttribute.needsUpdate = true;
  ballMaterial.needsUpdate = true;
}
const ballMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false,
});

const BALL_RADIUS = 20;
const STANDARD_DROP_HEIGHT = 300;
const SPX = 2055, SPZ = -762;
const machineBallMeta = new Map<any, { presetId: string; countedLanding: boolean }>();
let resetMachineOnClear = (): void => {};

function spawnPhysicsBall(
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  color?: number,
) {
  const mesh = new THREE.Mesh(bGeo, ballMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  scene.add(mesh);
  const ball = createBall(x, y, z, vx, vy, vz, mesh);
  if (!ball) scene.remove(mesh);
  document.getElementById('bc')!.textContent = String(getBallCount());
  return ball;
}

async function dropBall(): Promise<void> {
  if (!isReady()) return;

  const x = SPX + (Math.random() - 0.5) * 200;
  // ITTF table calibration drop: 300 mm from the ball's underside to the table.
  const y = TABLE_TOP_Y + BALL_RADIUS + STANDARD_DROP_HEIGHT;
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

// ==================== Serve machine ====================
let activePreset: ShotPreset = getPreset('top-light');
let machineRunning = false;
let nextMachineShotAt = 0;
let machineShotCount = 0;
let machineLandingCount = 0;

const presetGroupsEl = document.getElementById('preset-groups')!;
const strengthEl = document.getElementById('machine-strength') as HTMLInputElement;
const cadenceEl = document.getElementById('machine-cadence') as HTMLInputElement;
const laneEl = document.getElementById('machine-lane') as HTMLSelectElement;
const levelEl = document.getElementById('machine-level') as HTMLSelectElement;
const randomizeEl = document.getElementById('machine-randomize') as HTMLInputElement;
const ballStyleEl = document.getElementById('ball-style') as HTMLSelectElement;
const strengthValueEl = document.getElementById('strength-value')!;
const cadenceValueEl = document.getElementById('cadence-value')!;
const machineStatusEl = document.getElementById('machine-status')!;
const machineDetailEl = document.getElementById('machine-detail')!;
const machineToggleEl = document.getElementById('machine-toggle') as HTMLButtonElement;
const machineOnceEl = document.getElementById('machine-once') as HTMLButtonElement;
const targetMarker = new THREE.Mesh(
  new THREE.RingGeometry(34, 47, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
);
targetMarker.rotation.x = -Math.PI / 2;
targetMarker.position.y = TABLE_TOP_Y + 2;
targetMarker.visible = false;
scene.add(targetMarker);
const firstBounceMarker = new THREE.Mesh(
  new THREE.RingGeometry(25, 34, 28),
  new THREE.MeshBasicMaterial({ color: 0x54d6ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
);
firstBounceMarker.rotation.x = -Math.PI / 2;
firstBounceMarker.position.y = TABLE_TOP_Y + 3;
firstBounceMarker.visible = false;
scene.add(firstBounceMarker);
const serveTrajectoryLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0x54d6ff, dashSize: 45, gapSize: 24, transparent: true, opacity: .75 }),
);
serveTrajectoryLine.visible = false;
scene.add(serveTrajectoryLine);

function createMachineModel(): { group: THREE.Group; head: THREE.Group; upperMast: THREE.Mesh } {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x252b3a, metalness: 0.65, roughness: 0.32 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff9f43, metalness: 0.25, roughness: 0.28 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(280, 70, 300), dark);
  base.position.set(-290, 35, -762.5);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(28, 42, 950, 20), dark);
  mast.position.set(-290, 510, -762.5);
  const upperMast = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 1, 20), accent);
  upperMast.position.set(-290, 1030, -762.5);
  const head = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.BoxGeometry(230, 190, 230), dark);
  const wheelA = new THREE.Mesh(new THREE.CylinderGeometry(82, 82, 28, 24), accent);
  const wheelB = wheelA.clone();
  wheelA.rotation.x = Math.PI / 2; wheelB.rotation.x = Math.PI / 2;
  wheelA.position.z = -82; wheelB.position.z = 82;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(42, 58, 180, 24), accent);
  nozzle.rotation.z = -Math.PI / 2;
  nozzle.position.x = 175;
  head.add(housing, wheelA, wheelB, nozzle);
  head.position.set(-240, 1120, -762.5);
  group.add(base, mast, upperMast, head);
  group.traverse(object => {
    if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
  });
  scene.add(group);
  return { group, head, upperMast };
}

const machineModel = createMachineModel();

function setMachineVisible(visible: boolean): void {
  machineModel.group.visible = visible;
}

type ContactTechnique = 'forehand-loop' | 'forehand-drive' | 'backhand-loop' | 'block' | 'push' | 'chop';
interface ContactTechniqueSpec {
  label: string;
  forwardMm: number;
  lateralMm: number;
  aboveTableMm: number;
  timing: string;
  description: string;
}
const CONTACT_TECHNIQUES: Record<ContactTechnique, ContactTechniqueSpec> = {
  'forehand-loop': { label: '正手拉球', forwardMm: 500, lateralMm: -620, aboveTableMm: 300, timing: '最高点附近或下降初段', description: '右手持拍者的身体右前方，留出躯干转动和前臂加速空间。' },
  'forehand-drive': { label: '正手快攻', forwardMm: 430, lateralMm: -560, aboveTableMm: 245, timing: '上升后段至最高点', description: '比拉球更靠前、更早迎球，以较短动作借力加速。' },
  'backhand-loop': { label: '反手拧拉', forwardMm: 390, lateralMm: -40, aboveTableMm: 220, timing: '上升后段', description: '击球点位于身体正前略偏反手侧，肘部在身前建立挥拍空间。' },
  block: { label: '快带/挡', forwardMm: 350, lateralMm: -80, aboveTableMm: 210, timing: '上升期', description: '靠近身体正前方，尽早借用来球速度，动作幅度最短。' },
  push: { label: '搓球', forwardMm: 520, lateralMm: -160, aboveTableMm: 105, timing: '上升后段至最高点', description: '台内身前触球，拍面进入球下部，击球点低且更靠近台面。' },
  chop: { label: '削球', forwardMm: 420, lateralMm: -600, aboveTableMm: 150, timing: '下降期', description: '身体侧前方较低位置触球，为向下、向前的长挥拍留出空间。' },
};
const TRACKING_PRESET_IDS: Record<ContactTechnique, string> = {
  'forehand-loop': 'top-light',
  'forehand-drive': 'float-long',
  'backhand-loop': 'top-light',
  block: 'top-drive',
  push: 'float-short',
  chop: 'top-drive',
};
let contactTechnique: ContactTechnique = 'forehand-loop';

const contactGuideMaterial = new THREE.MeshBasicMaterial({ color: 0x54d6ff, wireframe: true, transparent: true, opacity: 0.95 });
const contactGuideMarker = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 12), contactGuideMaterial);
const actualContactMarker = new THREE.Mesh(
  new THREE.SphereGeometry(34, 18, 14),
  new THREE.MeshBasicMaterial({ color: 0xffd166, wireframe: true, transparent: true, opacity: 0.95 }),
);
const contactLink = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0x54d6ff, dashSize: 45, gapSize: 24, transparent: true, opacity: 0.7 }),
);
contactGuideMarker.visible = actualContactMarker.visible = contactLink.visible = false;
scene.add(contactGuideMarker, actualContactMarker, contactLink);

function contactGuidePosition(): THREE.Vector3 {
  const stance = VIEW_STANCES[viewStance];
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  const heightAdjustment = (viewHeightMm - 1600) * 0.22;
  // Once the player has already moved to the wide forehand/backhand lane,
  // the contact point shifts back toward the table centre; otherwise applying
  // the full body-relative offset would place the racket outside the table.
  const lateralMm = viewStance === 'forehand' && contactTechnique.startsWith('forehand')
    ? 80
    : viewStance === 'backhand' && contactTechnique === 'backhand-loop'
      ? -80
      : spec.lateralMm;
  return new THREE.Vector3(
    stance.x - spec.forwardMm,
    TABLE_TOP_Y + spec.aboveTableMm + heightAdjustment,
    stance.z + lateralMm,
  );
}

function updateContactGuide(show = contactGuideMarker.visible): void {
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  const point = contactGuidePosition();
  contactGuideMarker.position.copy(point);
  contactGuideMarker.visible = show;
  contactLink.visible = show;
  contactLink.geometry.dispose();
  contactLink.geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(VIEW_STANCES[viewStance].x, Math.max(900, viewHeightMm * 0.72), VIEW_STANCES[viewStance].z),
    point,
  ]);
  contactLink.computeLineDistances();
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${spec.label}</strong>：${spec.description}<br>击球时机：${spec.timing}`;
}

applyViewPreset();
updateContactGuide(false);

function readMachineSettings(): MachineSettings {
  return {
    strength: Number(strengthEl.value) / 100,
    cadence: Number(cadenceEl.value),
    targetLane: laneEl.value as TargetLane,
    randomize: randomizeEl.checked,
    playerLevel: levelEl.value as PlayerLevel,
  };
}

function updateMachineHead(heightMm: number): void {
  machineModel.head.position.y = heightMm;
  const lowerY = 970;
  const upperY = heightMm - 90;
  machineModel.upperMast.position.y = (lowerY + upperY) / 2;
  machineModel.upperMast.scale.y = Math.max(1, upperY - lowerY);
}

function signedSpin(value: number, positive: string, negative: string): string {
  if (Math.abs(value) < 1) return '0';
  return `${value > 0 ? positive : negative} ${Math.round(Math.abs(value))}`;
}

function updateMachineDetails(solution?: LaunchSolution): void {
  const settings = readMachineSettings();
  const level = PLAYER_LEVELS[settings.playerLevel] ?? PLAYER_LEVELS.advanced;
  const nominalSpeed = activePreset.speedMps * settings.strength * level.speedScale;
  const shownSpeed = solution?.speedMps ?? nominalSpeed;
  const spinFactor = (0.75 + 0.25 * settings.strength) * level.spinScale;
  const nominalSpin = Math.hypot(
    activePreset.topRpm,
    activePreset.sideRpm,
    activePreset.corkRpm,
  ) * spinFactor;
  strengthValueEl.textContent = `${Math.round(settings.strength * 100)}%`;
  cadenceValueEl.textContent = `${settings.cadence.toFixed(1)} 球/秒`;
  const clearance = solution ? ` · 过网余量 ${Math.round(solution.netClearanceMm)}mm` : '';
  const serveRoute = activePreset.mode === 'serve'
    ? `<br>双跳路线 <span style="color:#54d6ff">● ${activePreset.firstBounceMm ?? 720}mm</span> → <span style="color:#ffd166">● ${activePreset.targetDepthMm}mm</span>`
    : '';
  machineDetailEl.innerHTML =
    `<strong>${activePreset.name}</strong> · ${activePreset.description}<br>` +
    `${level.label} · 速度 ${shownSpeed.toFixed(1)}m/s (${Math.round(shownSpeed * 3.6)}km/h)${clearance}${serveRoute}` +
    `<div class="spin-grid">` +
    `<span class="spin-chip">上下旋<b>${signedSpin(activePreset.topRpm * spinFactor, '上旋', '下旋')} rpm</b></span>` +
    `<span class="spin-chip">侧旋<b>${signedSpin(activePreset.sideRpm * spinFactor, '左侧', '右侧')} rpm</b></span>` +
    `<span class="spin-chip">轴向旋转<b>${Math.round(Math.abs(activePreset.corkRpm * spinFactor))} rpm</b></span>` +
    `<span class="spin-chip">合成旋转<b data-testid="composite-spin">${Math.round(solution?.spinRpm ?? nominalSpin)} rpm</b></span>` +
    `</div><button id="parameter-info" class="info-button" type="button">ⓘ 参数与物理说明</button>`;
  document.getElementById('parameter-info')?.addEventListener('click', showParameterDialog);
}

const parameterDialog = document.getElementById('parameter-dialog') as HTMLDialogElement;
function showParameterDialog(): void {
  const settings = readMachineSettings();
  const level = PLAYER_LEVELS[settings.playerLevel];
  const rpm = Math.round(Math.hypot(activePreset.topRpm, activePreset.sideRpm, activePreset.corkRpm) * level.spinScale);
  document.getElementById('dialog-title')!.textContent = `${activePreset.name} · 参数说明`;
  document.getElementById('dialog-content')!.innerHTML = `
    <p><b>${level.label}</b>：${level.reference}</p>
    <h3>当前球路</h3><ul><li>平动速度：约 ${(activePreset.speedMps * level.speedScale).toFixed(1)} m/s</li><li>合成旋转：约 ${rpm} rpm；它是三个旋转轴分量的向量长度，不会把方向信息丢掉。</li><li>${activePreset.mode === 'serve' ? '开局发球：先在发球方台面落一次，再越网落到接球方。' : '多球训练：球从发球机直接越网，在接球方落台。'}</li></ul>
    <h3>参考如何理解</h3><p>档位是训练强度参考，不是给选手贴等级标签。<a href="https://journals.sagepub.com/doi/10.1177/22150218251409592" target="_blank" rel="noreferrer">世界级比赛研究</a>中，短/长发球中位转速约为 46.4/50.9 rps（约 2780/3050 rpm）；拉球研究观察到强攻球可超过 110 rps（6600 rpm）。另参考<a href="https://doi.org/10.3390/app15116350" target="_blank" rel="noreferrer">精英青年球员的球速/旋转光学测量</a>。球种、男女、器材和测量方法都会改变结果。</p>
    <h3>为什么会拐与前冲</h3><p>伯努利压差可帮助直观理解两侧流速差；对旋转球的整体气动力通常称为马格努斯效应。上旋产生向下力，侧旋产生横向力。落台时接触摩擦把切向旋转转换为线速度，所以会前冲、停顿或侧拐。</p>`;
  parameterDialog.showModal();
}
document.getElementById('dialog-close')!.addEventListener('click', () => parameterDialog.close());

function setActivePreset(preset: ShotPreset, updateCadence = true): void {
  activePreset = preset;
  if (updateCadence) cadenceEl.value = String(preset.cadence);
  document.querySelectorAll<HTMLButtonElement>('.preset-button').forEach(button => {
    button.classList.toggle('active', button.dataset.preset === preset.id);
  });
  updateMachineDetails();
}

function renderPresetButtons(): void {
  presetGroupsEl.replaceChildren();
  for (const category of SHOT_CATEGORIES) {
    const section = document.createElement('section');
    section.className = 'preset-group';
    const title = document.createElement('h3');
    title.textContent = category;
    const buttons = document.createElement('div');
    buttons.className = 'preset-buttons';
    for (const preset of SHOT_PRESETS.filter(item => item.category === category)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset-button';
      button.dataset.preset = preset.id;
      button.style.setProperty('--preset-color', `#${preset.color.toString(16).padStart(6, '0')}`);
      const spin = Math.round(Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm));
      button.title = `${preset.description} ${preset.speedMps}m/s · ${spin}rpm`;
      button.dataset.tip = `${preset.description}｜基准 ${preset.speedMps}m/s｜合成 ${spin}rpm${preset.mode === 'serve' ? '｜合法双落台发球' : ''}`;
      button.innerHTML = preset.shortcut
        ? `<kbd>${preset.shortcut}</kbd>${preset.name}`
        : preset.name;
      button.addEventListener('click', () => setActivePreset(preset));
      buttons.appendChild(button);
    }
    section.append(title, buttons);
    presetGroupsEl.appendChild(section);
  }
}

function feedMachine(preset = activePreset, preserveTracking = false): RapierBall | undefined {
  if (!isReady()) return undefined;
  if (!preserveTracking) stopTrackingDemo();
  setMachineVisible(true);
  demoActive = false;
  clearDemoLines();
  if (getBallCount() >= 80) {
    const oldest = getBalls()[0];
    scene.remove(oldest.mesh);
    machineBallMeta.delete(oldest.body);
    removeBall(oldest);
  }
  const solution = solveLaunch(preset, readMachineSettings());
  const ball = spawnPhysicsBall(
    solution.originMm.x, solution.originMm.y, solution.originMm.z,
    solution.velocityMm.x, solution.velocityMm.y, solution.velocityMm.z,
    preset.color,
  );
  if (!ball) return undefined;
  ball.body.setAngvel(solution.angularVelocity, true);
  machineBallMeta.set(ball.body, { presetId: preset.id, countedLanding: false });
  updateMachineHead(solution.originMm.y);
  targetMarker.position.set(solution.targetMm.x, TABLE_TOP_Y + 2, solution.targetMm.z);
  targetMarker.visible = true;
  const isOpeningServe = preset.mode === 'serve';
  firstBounceMarker.visible = isOpeningServe;
  serveTrajectoryLine.visible = isOpeningServe;
  if (isOpeningServe) {
    firstBounceMarker.position.set(preset.firstBounceMm ?? 720, TABLE_TOP_Y + 3, solution.targetMm.z);
    serveTrajectoryLine.geometry.dispose();
    serveTrajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints(
      sampleTrajectory(solution, 1.05).map(point => new THREE.Vector3(point.x, point.y, point.z)),
    );
    serveTrajectoryLine.computeLineDistances();
  }
  machineShotCount += 1;
  document.getElementById('machine-shot-count')!.textContent = String(machineShotCount);
  updateMachineDetails(solution);
  return ball;
}

type TrackingPhase = 'follow-launch' | 'look-back' | 'reacquire' | 'follow-contact' | 'contact-hold';
interface TrackingSession {
  ball: RapierBall;
  phase: TrackingPhase;
  phaseStartedAt: number;
  startedAt: number;
  previousVy: number;
  apexPoint: THREE.Vector3;
  actualPoint: THREE.Vector3;
  closestPoint: THREE.Vector3;
  closestDistance: number;
}
let trackingSession: TrackingSession | null = null;
const trackingTarget = new THREE.Vector3();
const machineLookPoint = new THREE.Vector3();

function trackingPhaseLabel(phase: TrackingPhase): string {
  if (phase === 'follow-launch') return '跟随来球，寻找最高点';
  if (phase === 'look-back') return '已到最高点，回看发球机';
  if (phase === 'reacquire') return '重新捕捉来球';
  if (phase === 'follow-contact') return '持续跟球至击球点';
  return '击球瞬间已锁定';
}

function setTrackingStatus(phase: TrackingPhase, detail = ''): void {
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${trackingPhaseLabel(phase)}</strong> · ${spec.label}${detail ? `<br>${detail}` : `<br>${spec.description}`}`;
}

function stopTrackingDemo(resetStatus = true): void {
  trackingSession = null;
  controls.enabled = true;
  contactGuideMarker.visible = false;
  actualContactMarker.visible = false;
  contactLink.visible = false;
  document.getElementById('tracking-start')?.classList.remove('active');
  if (resetStatus) updateContactGuide(false);
}

async function startTrackingDemo(): Promise<void> {
  if (!isReady()) return;
  await clearBalls();
  setMachineRunning(false);
  applyViewPreset();
  updateContactGuide(true);
  actualContactMarker.visible = false;
  // Feed the selected wing without permanently changing the user's machine
  // settings. Right-handed forehand contacts are on world -Z when the player
  // faces the machine; backhand/short-touch contacts stay near the middle.
  const previousLane = laneEl.value;
  const previousRandomize = randomizeEl.checked;
  const desiredContactZ = contactGuidePosition().z;
  const laneCandidates: Array<{ value: TargetLane; z: number }> = [
    { value: 'forehand', z: -1275 },
    { value: 'middle', z: -762.5 },
    { value: 'backhand', z: -250 },
  ];
  laneEl.value = laneCandidates.reduce((closest, candidate) =>
    Math.abs(candidate.z - desiredContactZ) < Math.abs(closest.z - desiredContactZ) ? candidate : closest,
  ).value;
  randomizeEl.checked = false;
  const trackingPreset = getPreset(TRACKING_PRESET_IDS[contactTechnique]);
  setActivePreset(trackingPreset);
  const ball = feedMachine(trackingPreset, true);
  laneEl.value = previousLane;
  randomizeEl.checked = previousRandomize;
  if (!ball) {
    stopTrackingDemo();
    return;
  }
  const velocity = ball.body.linvel();
  const position = ball.body.translation();
  const now = performance.now();
  trackingSession = {
    ball,
    phase: 'follow-launch',
    phaseStartedAt: now,
    startedAt: now,
    previousVy: velocity.y,
    apexPoint: new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000),
    actualPoint: new THREE.Vector3(),
    closestPoint: new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000),
    closestDistance: Number.POSITIVE_INFINITY,
  };
  controls.enabled = false;
  trackingTarget.set(position.x * 1000, position.y * 1000, position.z * 1000);
  controls.target.copy(trackingTarget);
  document.getElementById('tracking-start')!.classList.add('active');
  setTrackingStatus('follow-launch');
}

function updateTrackingDemo(now: number): void {
  const session = trackingSession;
  if (!session) return;
  if (!getBalls().includes(session.ball)) {
    stopTrackingDemo();
    return;
  }
  const position = session.ball.body.translation();
  const velocity = session.ball.body.linvel();
  const ballPoint = new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000);
  const elapsedInPhase = now - session.phaseStartedAt;
  const guide = contactGuidePosition();
  const distanceToGuide = ballPoint.distanceTo(guide);
  if (session.ball.tableImpacts > 0 && distanceToGuide < session.closestDistance) {
    session.closestDistance = distanceToGuide;
    session.closestPoint.copy(ballPoint);
  }

  if (session.phase === 'follow-launch') {
    trackingTarget.copy(ballPoint);
    const passedApex = session.previousVy > 0 && velocity.y <= 0;
    const launchedDownward = now - session.startedAt > 180 && session.previousVy <= 0 && velocity.y <= session.previousVy;
    if (passedApex || launchedDownward) {
      session.apexPoint.copy(ballPoint);
      session.phase = 'look-back';
      session.phaseStartedAt = now;
      setTrackingStatus('look-back', `最高点约 ${Math.round(ballPoint.y)} mm；短暂确认发球机方向。`);
    }
  } else if (session.phase === 'look-back') {
    machineLookPoint.set(25, machineModel.head.position.y, -762.5);
    trackingTarget.lerp(machineLookPoint, 0.13);
    if (elapsedInPhase > 520) {
      session.phase = 'reacquire';
      session.phaseStartedAt = now;
      setTrackingStatus('reacquire');
    }
  } else if (session.phase === 'reacquire') {
    trackingTarget.lerp(ballPoint, 0.2);
    if (elapsedInPhase > 300) {
      session.phase = 'follow-contact';
      session.phaseStartedAt = now;
      setTrackingStatus('follow-contact', `蓝色标记为${CONTACT_TECHNIQUES[contactTechnique].timing}的基准击球点。`);
    }
  } else if (session.phase === 'follow-contact') {
    trackingTarget.copy(ballPoint);
    if (position.x * 1000 >= guide.x) {
      session.phase = 'contact-hold';
      session.phaseStartedAt = now;
      session.actualPoint.copy(ballPoint);
      actualContactMarker.position.copy(ballPoint);
      actualContactMarker.visible = true;
      const offset = ballPoint.distanceTo(guide);
      const delta = ballPoint.clone().sub(guide);
      setTrackingStatus('contact-hold', `黄色标记为实际球到达击球平面的瞬间；与精英基准点相差 ${Math.round(offset)} mm（高度 ${Math.round(delta.y)} / 横向 ${Math.round(delta.z)} mm）。`);
    } else if (session.ball.tableImpacts > 0 && (position.y < 0.08 || velocity.x <= 0)) {
      session.phase = 'contact-hold';
      session.phaseStartedAt = now;
      session.actualPoint.copy(session.closestPoint);
      actualContactMarker.position.copy(session.closestPoint);
      actualContactMarker.visible = true;
      setTrackingStatus('contact-hold', `当前站位无法进入该球的标准击球窗口；黄色标记为最接近点，建议切换更靠近球台的站位。`);
    }
  } else {
    trackingTarget.copy(session.actualPoint);
  }

  session.previousVy = velocity.y;
  controls.target.lerp(trackingTarget, session.phase === 'contact-hold' ? 0.22 : 0.3);
}

function setMachineRunning(running: boolean): void {
  if (running) stopTrackingDemo();
  machineRunning = running;
  nextMachineShotAt = performance.now();
  machineToggleEl.classList.toggle('active', running);
  machineToggleEl.textContent = running ? '暂停连续 [P]' : '连续发球 [P]';
  machineStatusEl.textContent = running ? '运行中' : '已停止';
  machineStatusEl.classList.toggle('running', running);
}

resetMachineOnClear = () => {
  stopTrackingDemo(false);
  setMachineRunning(false);
  setMachineVisible(true);
  targetMarker.visible = false;
  firstBounceMarker.visible = false;
  serveTrajectoryLine.visible = false;
  demoActive = false;
  clearDemoLines();
};

renderPresetButtons();
setActivePreset(activePreset);
machineOnceEl.addEventListener('click', () => feedMachine());
machineToggleEl.addEventListener('click', () => setMachineRunning(!machineRunning));
strengthEl.addEventListener('input', () => updateMachineDetails());
cadenceEl.addEventListener('input', () => updateMachineDetails());
laneEl.addEventListener('change', () => updateMachineDetails());
levelEl.addEventListener('change', () => updateMachineDetails());
randomizeEl.addEventListener('change', () => updateMachineDetails());
ballStyleEl.addEventListener('change', () => setBallStyle(ballStyleEl.value as BallStyle));
document.querySelectorAll<HTMLButtonElement>('[data-contact-technique]').forEach(button => {
  button.addEventListener('click', () => {
    const wasTracking = Boolean(trackingSession);
    contactTechnique = button.dataset.contactTechnique as ContactTechnique;
    document.querySelectorAll<HTMLButtonElement>('[data-contact-technique]').forEach(item => {
      item.classList.toggle('active', item === button);
    });
    updateContactGuide(wasTracking);
    if (wasTracking) void startTrackingDemo();
  });
});
document.getElementById('tracking-start')!.addEventListener('click', () => void startTrackingDemo());
document.getElementById('tracking-stop')!.addEventListener('click', () => stopTrackingDemo());
setBallStyle(ballStyleEl.value as BallStyle);

// ==================== Topspin demonstration ====================
const demoPowerEl = document.getElementById('demo-power') as HTMLInputElement;
const demoSpinEl = document.getElementById('demo-spin') as HTMLInputElement;
const demoSideEl = document.getElementById('demo-side') as HTMLInputElement;
const demoLines: THREE.Line[] = [];
let demoActive = false;

function clearDemoLines(): void {
  for (const line of demoLines) { scene.remove(line); line.geometry.dispose(); }
  demoLines.length = 0;
}

function demoSolutions(): [LaunchSolution, LaunchSolution] {
  const speed = Number(demoPowerEl.value) / 10;
  const spin = Number(demoSpinEl.value);
  const side = Number(demoSideEl.value);
  const elevation = THREE.MathUtils.degToRad(8);
  const vx = speed * Math.cos(elevation);
  const vy = speed * Math.sin(elevation);
  const rpmToRad = 2 * Math.PI / 60;
  const spun: LaunchSolution = {
    originMm: { x: -180, y: 1280, z: -762.5 },
    velocityMm: { x: vx * 1000, y: vy * 1000, z: 0 },
    angularVelocity: { x: side * .25 * rpmToRad, y: side * rpmToRad, z: -spin * rpmToRad },
    targetMm: { x: 2380, y: TABLE_TOP_Y + BALL_RADIUS, z: -762.5 },
    speedMps: speed,
    spinRpm: Math.hypot(spin, side, side * .25),
    netClearanceMm: 0,
  };
  const flat: LaunchSolution = { ...spun, angularVelocity: { x: 0, y: 0, z: 0 }, spinRpm: 0 };
  return [flat, spun];
}

function updateDemo(): void {
  document.getElementById('demo-power-value')!.textContent = `${(Number(demoPowerEl.value) / 10).toFixed(1)} m/s`;
  document.getElementById('demo-spin-value')!.textContent = `${demoSpinEl.value} rpm`;
  document.getElementById('demo-side-value')!.textContent = `${Number(demoSideEl.value) > 0 ? '+' : ''}${demoSideEl.value} rpm`;
  const speed = Number(demoPowerEl.value) / 10;
  const omega = Number(demoSpinEl.value) * 2 * Math.PI / 60;
  const spinParameter = .02 * omega / Math.max(.1, speed);
  const liftCoefficient = .5 * (1 - Math.exp(-1.8 * spinParameter));
  const dynamicPressure = .5 * 1.204 * speed * speed;
  const pressureDifference = dynamicPressure * liftCoefficient;
  const downwardAcceleration = pressureDifference * Math.PI * .02 ** 2 / .0027;
  document.getElementById('demo-metrics')!.innerHTML =
    `旋转参数 S=${spinParameter.toFixed(2)} · 升力系数 C<sub>L</sub>=${liftCoefficient.toFixed(3)}<br>` +
    `估算压强差 ${pressureDifference.toFixed(1)}Pa · 额外下坠 ${downwardAcceleration.toFixed(1)}m/s²（${(downwardAcceleration / 9.81).toFixed(2)}g）`;
  clearDemoLines();
  if (!demoActive) return;
  const colors = [0xb8c0cc, 0xff5d73];
  demoSolutions().forEach((solution, i) => {
    const points = sampleTrajectory(solution).map(p => new THREE.Vector3(p.x, p.y, p.z + (i === 0 ? -45 : 45)));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: colors[i], transparent: true, opacity: .9 }));
    scene.add(line); demoLines.push(line);
  });
}

function fireDemo(): void {
  demoActive = true;
  setMachineVisible(false);
  updateDemo();
  demoSolutions().forEach((solution, i) => {
    const zOffset = i === 0 ? -45 : 45;
    const ball = spawnPhysicsBall(solution.originMm.x, solution.originMm.y, solution.originMm.z + zOffset, solution.velocityMm.x, solution.velocityMm.y, solution.velocityMm.z, i === 0 ? 0xb8c0cc : 0xff5d73);
    ball?.body.setAngvel(solution.angularVelocity, true);
  });
}
demoPowerEl.addEventListener('input', updateDemo);
demoSpinEl.addEventListener('input', updateDemo);
demoSideEl.addEventListener('input', updateDemo);
document.getElementById('demo-preview')!.addEventListener('click', () => {
  demoActive = true;
  setMachineVisible(false);
  updateDemo();
});
document.getElementById('demo-fire')!.addEventListener('click', fireDemo);
updateDemo();

// ==================== Loop ====================
let frames = 0, ft = 0, fps = 0, lastT = performance.now();

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  const elapsedMs = Math.min(now - lastT, 100);
  lastT = now;

  if (machineRunning && now >= nextMachineShotAt) {
    feedMachine();
    nextMachineShotAt = now + 1000 / readMachineSettings().cadence;
  }

  // Tracking is an instructional slow-motion mode: eye/head turns happen in
  // real time while the ball advances at 0.35×, so the viewer can glance back
  // at the machine and still reacquire the ball before the contact window.
  physicsStep(elapsedMs / 1000 * (trackingSession ? 0.35 : 1));
  syncMeshes();
  updateTrackingDemo(now);

  for (const ball of getBalls()) {
    const meta = machineBallMeta.get(ball.body);
    if (
      meta && !meta.countedLanding &&
      ball.lastTableImpact && ball.lastTableImpact.x > 1.37
    ) {
      meta.countedLanding = true;
      machineLandingCount += 1;
      document.getElementById('machine-land-count')!.textContent = String(machineLandingCount);
    }
  }

  if (import.meta.env.DEV) {
    const firstBall = getBalls()[0];
    const counter = document.getElementById('bc')!;
    if (firstBall) {
      counter.dataset.telemetry = JSON.stringify({
        position: firstBall.body.translation(),
        linearVelocity: firstBall.body.linvel(),
        angularVelocity: firstBall.body.angvel(),
        tableImpacts: firstBall.tableImpacts,
        lastTableImpact: firstBall.lastTableImpact,
      });
      counter.dataset.allTelemetry = JSON.stringify(getBalls().map(ball => ({
        position: ball.body.translation(),
        linearVelocity: ball.body.linvel(),
        angularVelocity: ball.body.angvel(),
        tableImpacts: ball.tableImpacts,
        lastTableImpact: ball.lastTableImpact,
      })));
    } else {
      delete counter.dataset.telemetry;
      delete counter.dataset.allTelemetry;
    }
  }

  ft += elapsedMs;
  frames++;
  if (ft >= 500) {
    fps = Math.round(frames / (ft / 1000));
    frames = 0; ft = 0;
    document.getElementById('fps')!.textContent = String(fps);
  }
  controls.update();
  renderer.render(scene, camera);
}

setInterval(() => {
  const all = getBalls();
  for (let i = all.length - 1; i >= 0; i--) {
    const position = all[i].body.translation();
    const outsideVenue =
      position.x < -5.7 || position.x > 8.45 ||
      position.z < -4.35 || position.z > 2.82 ||
      position.y < -0.25;
    if (outsideVenue) {
      scene.remove(all[i].mesh);
      machineBallMeta.delete(all[i].body);
      removeBall(all[i]);
    }
  }
  document.getElementById('bc')!.textContent = String(getBallCount());
}, 5000);

initPhysics().then(() => {
  animate();
});

window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    dropBall();
  }
  if (e.key.toLowerCase() === 'f') feedMachine();
  if (e.key.toLowerCase() === 'p') setMachineRunning(!machineRunning);
  const shortcutPreset = SHOT_PRESETS.find(preset => preset.shortcut === e.key);
  if (shortcutPreset) {
    setActivePreset(shortcutPreset);
    feedMachine(shortcutPreset);
  }
  if (e.key === 'r') {
    viewHeightMm = 1600;
    viewStance = 'mid';
    applyViewPreset();
  }
  if (e.key === 'x') clearBalls();
});

window.addEventListener('resize', () => {
  camera.aspect = c.clientWidth / c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth, c.clientHeight);
});

// ==================== Load STLs ====================
const loader = new STLLoader();
const BASE = import.meta.env.BASE_URL;

function loadSTL(
  file: string,
  color: number,
  ml: number,
  rough: number,
  op: number,
): Promise<THREE.Mesh> {
  return new Promise((ok, fail) => {
    loader.load(
      BASE + 'stl/' + file,
      geo => {
        geo.computeVertexNormals();
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshPhysicalMaterial({
          color,
          metalness: ml,
          roughness: rough,
          transparent: op < 1,
          opacity: op,
          clearcoat: 0.05,
          clearcoatRoughness: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        scene.add(mesh);
        ok(mesh);
      },
      undefined,
      fail,
    );
  });
}

const msg = document.createElement('div');
msg.id = 'load-msg';
msg.style.cssText =
  'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#8899aa;font-size:14px;z-index:100;';
msg.textContent = '加载模型中...';
document.body.appendChild(msg);

(async () => {
  try {
    await loadSTL('table-surface.stl', 0x0b0d12, 0.02, 0.48, 1);
    await loadSTL('table-frame.stl', 0x555555, 0.3, 0.4, 1);
    await loadSTL('table-legs.stl', 0x5a5a6e, 0.3, 0.35, 1);
    await loadSTL('table-net.stl', 0xdddddd, 0.15, 0.3, 0.7);
    msg.remove();
  } catch (e: any) {
    msg.textContent = '加载失败: ' + e.message;
    console.error(e);
  }
})();
