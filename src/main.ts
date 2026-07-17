import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { createIcons, MousePointer2, ArrowDown, X, Wrench, Bot, Eye, FlaskConical, BarChart3, Minus } from 'lucide';
import { init as initPhysics, isReady, createBall, removeBall, clearAllBalls, getBalls, step as physicsStep, syncMeshes, getBallCount, type RapierBall } from './physics';
import {
  SHOT_CATEGORIES,
  SHOT_PRESETS,
  PLAYER_LEVELS,
  RUBBER_PROFILES,
  getPreset,
  getShotKnowledge,
  sampleTrajectory,
  solveLaunch,
  type LaunchSolution,
  type BallStyle,
  type MachineSettings,
  type PlayerLevel,
  type ShotPreset,
  type TargetLane,
} from './serveMachine';

createIcons({ icons: { MousePointer2, ArrowDown, X, Wrench, Bot, Eye, FlaskConical, BarChart3, Minus } });

// ==================== 2D window manager ====================
const WINDOW_IDS = ['utility-window', 'machine-window', 'tracking-window', 'demo-window', 'stats-window'] as const;
type WindowId = typeof WINDOW_IDS[number];
const WINDOW_PREFS_KEY = 'pingpong-sim:window-preferences:v1';
interface WindowPreferences {
  open?: Partial<Record<WindowId, boolean>>;
  positions?: Partial<Record<WindowId, { left: number; top: number }>>;
}

function readWindowPreferences(): WindowPreferences {
  try {
    return JSON.parse(localStorage.getItem(WINDOW_PREFS_KEY) ?? '{}') as WindowPreferences;
  } catch {
    return {};
  }
}

function writeWindowPreferences(preferences: WindowPreferences): void {
  try { localStorage.setItem(WINDOW_PREFS_KEY, JSON.stringify(preferences)); } catch { /* private mode */ }
}

function saveWindowPreferences(): void {
  const preferences: WindowPreferences = { open: {}, positions: {} };
  for (const id of WINDOW_IDS) {
    const windowEl = document.getElementById(id);
    if (!windowEl) continue;
    preferences.open![id] = !windowEl.classList.contains('is-closed');
    const left = Number.parseFloat(windowEl.style.left);
    const top = Number.parseFloat(windowEl.style.top);
    if (Number.isFinite(left) && Number.isFinite(top)) preferences.positions![id] = { left, top };
  }
  writeWindowPreferences(preferences);
}

function clampWindowPosition(windowEl: HTMLElement, left: number, top: number): void {
  const width = windowEl.offsetWidth || windowEl.getBoundingClientRect().width;
  const height = windowEl.offsetHeight || windowEl.getBoundingClientRect().height;
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  windowEl.style.left = `${Math.round(Math.min(Math.max(left, margin), maxLeft))}px`;
  windowEl.style.top = `${Math.round(Math.min(Math.max(top, margin), maxTop))}px`;
  windowEl.style.right = 'auto';
  windowEl.style.bottom = 'auto';
}

function restoreWindowPreferences(): void {
  const preferences = readWindowPreferences();
  for (const id of WINDOW_IDS) {
    const windowEl = document.getElementById(id);
    if (!windowEl) continue;
    const savedPosition = preferences.positions?.[id];
    if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
      // Temporarily show a closed window so its dimensions are measurable.
      const wasClosed = windowEl.classList.contains('is-closed');
      if (wasClosed) windowEl.classList.remove('is-closed');
      clampWindowPosition(windowEl, savedPosition.left, savedPosition.top);
      if (wasClosed) windowEl.classList.add('is-closed');
    }
    if (typeof preferences.open?.[id] === 'boolean') {
      windowEl.classList.toggle('is-closed', !preferences.open[id]);
    }
  }
}

function setWindowOpen(id: WindowId, open: boolean): void {
  document.getElementById(id)?.classList.toggle('is-closed', !open);
  document.querySelector<HTMLButtonElement>(`[data-window-toggle="${id}"]`)?.classList.toggle('is-open', open);
  saveWindowPreferences();
}

function syncWindowIndicators(): void {
  for (const id of WINDOW_IDS) {
    const windowEl = document.getElementById(id);
    const toggle = document.querySelector<HTMLButtonElement>(`[data-window-toggle="${id}"]`);
    if (!windowEl || !toggle) continue;
    const open = !windowEl.classList.contains('is-closed');
    toggle.classList.toggle('is-open', open);
    toggle.classList.remove('is-active', 'is-warning');
  }
  const machineToggle = document.querySelector<HTMLButtonElement>('[data-window-toggle="machine-window"]');
  if (machineToggle && (machineRunning || (trackingEnabled && trackingContinuous))) machineToggle.classList.add('is-active');
  const trackingToggle = document.querySelector<HTMLButtonElement>('[data-window-toggle="tracking-window"]');
  if (trackingToggle && trackingEnabled) trackingToggle.classList.add('is-active');
  const demoToggle = document.querySelector<HTMLButtonElement>('[data-window-toggle="demo-window"]');
  if (demoToggle && demoActive) demoToggle.classList.add('is-active');
}

document.querySelectorAll<HTMLButtonElement>('[data-window-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const id = button.dataset.windowToggle as WindowId;
    const windowEl = document.getElementById(id);
    if (windowEl) setWindowOpen(id, windowEl.classList.contains('is-closed'));
    syncWindowIndicators();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-window-minimize]').forEach(button => {
  button.addEventListener('click', () => {
    const id = button.dataset.windowMinimize as WindowId;
    setWindowOpen(id, false);
    syncWindowIndicators();
  });
});

// Windows can be rearranged without leaving the viewport. Positions are
// persisted so a preferred layout survives refreshes and future sessions.
document.querySelectorAll<HTMLElement>('.ui-window').forEach(windowEl => {
  const id = windowEl.dataset.window as WindowId;
  const titlebar = windowEl.querySelector<HTMLElement>('.window-titlebar');
  if (!titlebar) return;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  titlebar.addEventListener('pointerdown', event => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = windowEl.getBoundingClientRect();
    dragging = true;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    // Convert right/bottom anchored defaults to explicit coordinates.
    clampWindowPosition(windowEl, rect.left, rect.top);
    titlebar.classList.add('is-dragging');
    titlebar.setPointerCapture(event.pointerId);
  });
  titlebar.addEventListener('pointermove', event => {
    if (!dragging) return;
    clampWindowPosition(windowEl, event.clientX - offsetX, event.clientY - offsetY);
  });
  const finishDrag = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    titlebar.classList.remove('is-dragging');
    if (titlebar.hasPointerCapture(event.pointerId)) titlebar.releasePointerCapture(event.pointerId);
    saveWindowPreferences();
  };
  titlebar.addEventListener('pointerup', finishDrag);
  titlebar.addEventListener('pointercancel', finishDrag);
  void id;
});
restoreWindowPreferences();
window.addEventListener('resize', () => {
  document.querySelectorAll<HTMLElement>('.ui-window:not(.is-closed)').forEach(windowEl => {
    const rect = windowEl.getBoundingClientRect();
    clampWindowPosition(windowEl, rect.left, rect.top);
  });
  saveWindowPreferences();
});

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
type StanceMode = 'fixed' | 'auto';
interface StancePose { x: number; z: number; label: string; }
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
const STANCE_MODE_KEY = 'pingpong-stance-mode-v1';
let stanceMode: StanceMode = (() => {
  try { return localStorage.getItem(STANCE_MODE_KEY) === 'auto' ? 'auto' : 'fixed'; }
  catch { return 'fixed'; }
})();
let autoContactZ = TABLE_CENTER_Z;
type QuickViewId = 'follow' | 'referee' | 'god' | 'audience' | 'endline' | 'side';
const QUICK_VIEWS: Record<Exclude<QuickViewId, 'follow'>, { position: [number, number, number]; target: [number, number, number]; label: string }> = {
  referee: { position: [1450, 1750, 1050], target: [1370, TABLE_TOP_Y + 120, TABLE_CENTER_Z], label: '裁判视角' },
  god: { position: [1370, 6200, -762.5], target: [1370, TABLE_TOP_Y, -762.5], label: '上帝视角' },
  audience: { position: [5200, 3000, 3600], target: [1370, TABLE_TOP_Y + 120, TABLE_CENTER_Z], label: '观众席' },
  endline: { position: [4300, 1750, -762.5], target: [1370, TABLE_TOP_Y + 180, TABLE_CENTER_Z], label: '端线后方' },
  side: { position: [1370, 1850, -4200], target: [1370, TABLE_TOP_Y + 120, TABLE_CENTER_Z], label: '侧面看台' },
};
let activeQuickView: QuickViewId = 'follow';

function setQuickViewActive(id: QuickViewId): void {
  activeQuickView = id;
  document.querySelectorAll<HTMLButtonElement>('[data-quick-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.quickView === id);
  });
}

function applyViewPreset(): void {
  const stance = effectiveStancePose();
  camera.position.set(stance.x, viewHeightMm, stance.z);
  controls.target.set(TABLE_CENTER_X, TABLE_TOP_Y + 180, TABLE_CENTER_Z);
  controls.update();
  setQuickViewActive('follow');
  document.querySelectorAll<HTMLButtonElement>('[data-view-height]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.viewHeight) === viewHeightMm);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-view-stance]').forEach(button => {
    button.classList.toggle('active', button.dataset.viewStance === viewStance);
    button.disabled = stanceMode === 'auto';
  });
  updateStanceDisplay();
}

function applyQuickView(id: QuickViewId): void {
  if (id === 'follow') {
    applyViewPreset();
    updateContactGuide();
    return;
  }
  const preset = QUICK_VIEWS[id];
  camera.position.set(...preset.position);
  controls.target.set(...preset.target);
  controls.enabled = true;
  controls.update();
  setQuickViewActive(id);
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${preset.label}</strong>：观察球台整体空间关系；物理模拟仍按正常时间推进。`;
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
    stanceMode = 'fixed';
    viewStance = button.dataset.viewStance as ViewStance;
    persistStanceMode();
    applyViewPreset();
    updateContactGuide();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-stance-mode]').forEach(button => {
  button.addEventListener('click', () => {
    stanceMode = button.dataset.stanceMode as StanceMode;
    if (stanceMode === 'auto') autoContactZ = configuredContactZ();
    persistStanceMode();
    applyViewPreset();
    updateContactGuide();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-quick-view]').forEach(button => {
  button.addEventListener('click', () => applyQuickView(button.dataset.quickView as QuickViewId));
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

type ContactTechnique = 'forehand-loop' | 'forehand-drive' | 'backhand-loop' | 'counter-loop' | 'block' | 'punch' | 'push' | 'drop-shot' | 'long-push' | 'lift' | 'forehand-flick' | 'backhand-flick' | 'chop' | 'smash' | 'lob';
interface ContactTechniqueSpec {
  label: string;
  forwardMm: number;
  lateralMm: number;
  aboveTableMm: number;
  timing: string;
  description: string;
  tableContactX?: number;
}
const CONTACT_TECHNIQUES: Record<ContactTechnique, ContactTechniqueSpec> = {
  'forehand-loop': { label: '正手拉球', forwardMm: 500, lateralMm: -620, aboveTableMm: 300, timing: '最高点附近或下降初段', description: '右手持拍者的身体右前方，留出躯干转动和前臂加速空间。' },
  'forehand-drive': { label: '正手快攻', forwardMm: 430, lateralMm: -560, aboveTableMm: 245, timing: '上升后段至最高点', description: '比拉球更靠前、更早迎球，以较短动作借力加速。' },
  'backhand-loop': { label: '反手拉球', forwardMm: 390, lateralMm: -40, aboveTableMm: 245, timing: '上升后段至最高点', description: '针对出台球在身体正前略偏反手侧主动摩擦，区别于台内拧拉。' },
  'counter-loop': { label: '反拉', forwardMm: 460, lateralMm: -420, aboveTableMm: 310, timing: '最高点附近', description: '迎着强上旋主动摩擦并向前发力，拍面关闭程度随来旋增强。' },
  block: { label: '快带/挡', forwardMm: 350, lateralMm: -80, aboveTableMm: 210, timing: '上升期', description: '靠近身体正前方，尽早借用来球速度，动作幅度最短。' },
  punch: { label: '弹击', forwardMm: 360, lateralMm: -60, aboveTableMm: 235, timing: '上升后段', description: '以较厚碰撞和短促前臂加速处理弱旋、下沉或高于球网的来球。' },
  push: { label: '搓球', forwardMm: 520, lateralMm: -160, aboveTableMm: 105, timing: '第一次落台后、第二跳前', description: '接球方台内身前低位触球，拍面进入球下部；绝不等到第二跳出台。', tableContactX: 2300 },
  'drop-shot': { label: '摆短', forwardMm: 570, lateralMm: -120, aboveTableMm: 90, timing: '上升初段', description: '手腕稳定、触球薄且卸力，把短球再次控制在对方台内。', tableContactX: 2240 },
  'long-push': { label: '劈长', forwardMm: 500, lateralMm: -180, aboveTableMm: 115, timing: '上升后段', description: '借来球旋转向前下方加速，将球快速送到对方端线或追身位。', tableContactX: 2320 },
  lift: { label: '托球', forwardMm: 500, lateralMm: -120, aboveTableMm: 145, timing: '上升后段至最高点', description: '用较开拍面向前上方托起来球，适合台内短下旋或旋转不明的控制过渡。', tableContactX: 2300 },
  'forehand-flick': { label: '正手挑打', forwardMm: 535, lateralMm: -420, aboveTableMm: 155, timing: '上升后段至最高点', description: '上步进入台内，以前臂和手腕向前上方加速处理短球。', tableContactX: 2290 },
  'backhand-flick': { label: '反手拧拉', forwardMm: 510, lateralMm: -30, aboveTableMm: 165, timing: '上升后段', description: '肘部前置、手腕绕球侧面摩擦，主动处理短下旋或侧下旋。', tableContactX: 2290 },
  chop: { label: '削球', forwardMm: 420, lateralMm: -600, aboveTableMm: 150, timing: '下降期', description: '身体侧前方较低位置触球，为向下、向前的长挥拍留出空间。' },
  smash: { label: '扣杀', forwardMm: 430, lateralMm: -420, aboveTableMm: 430, timing: '最高点至下降初段', description: '针对明显高球用较厚碰撞向前下方加速，优先保证落点和连续。' },
  lob: { label: '放高球', forwardMm: 300, lateralMm: -350, aboveTableMm: 180, timing: '下降期低点', description: '远台被动时向前上方摩擦并抬高弧线，以深落点争取回位时间。' },
};
let contactTechnique: ContactTechnique = 'forehand-loop';
const TABLE_TECHNIQUES = new Set<ContactTechnique>(['push', 'drop-shot', 'long-push', 'lift', 'forehand-flick', 'backhand-flick']);
const AUTO_STANCE_MOVE_SPEED_MM_PER_SEC = 1450;

function persistStanceMode(): void {
  try { localStorage.setItem(STANCE_MODE_KEY, stanceMode); } catch { /* private mode */ }
}

function configuredContactZ(): number {
  const lane = laneEl.value as TargetLane;
  if (lane === 'forehand') return -1305;
  if (lane === 'backhand') return -220;
  return TABLE_CENTER_Z;
}

function autoStanceDepth(technique: ContactTechnique): { x: number; label: string } {
  const spec = CONTACT_TECHNIQUES[technique];
  if (TABLE_TECHNIQUES.has(technique)) return { x: (spec.tableContactX ?? 2280) + spec.forwardMm, label: '台内近台' };
  if (technique === 'block' || technique === 'punch' || technique === 'forehand-drive') return { x: 3150, label: '近台' };
  if (technique === 'chop') return { x: 4250, label: '远台削球' };
  if (technique === 'lob') return { x: 4500, label: '远台防守' };
  if (technique === 'smash') return { x: 3400, label: '中近台进攻' };
  return { x: 3600, label: '中台进攻' };
}

function effectiveStancePose(): StancePose {
  if (stanceMode === 'fixed') return VIEW_STANCES[viewStance];
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  const depth = autoStanceDepth(contactTechnique);
  const z = THREE.MathUtils.clamp(autoContactZ - spec.lateralMm, TABLE_CENTER_Z - VENUE_WIDTH / 2 + 600, TABLE_CENTER_Z + VENUE_WIDTH / 2 - 600);
  const laneLabel = autoContactZ < TABLE_CENTER_Z - 220 ? '正手位' : autoContactZ > TABLE_CENTER_Z + 220 ? '反手位' : '中路';
  const forehandTechnique = contactTechnique.startsWith('forehand') || contactTechnique === 'counter-loop' || contactTechnique === 'smash';
  const backhandTechnique = contactTechnique.startsWith('backhand');
  const tacticalLabel = laneLabel === '反手位' && forehandTechnique
    ? '反手位侧身正手'
    : laneLabel === '正手位' && backhandTechnique
      ? '正手位大跨步反手'
      : laneLabel;
  return { x: depth.x, z, label: `${tacticalLabel} · ${depth.label} · ${spec.label}` };
}

let receiveFailureTimer: number | null = null;

function clearReceiveFailureFeedback(): void {
  const flash = document.getElementById('receive-failure-flash')!;
  if (receiveFailureTimer !== null) window.clearTimeout(receiveFailureTimer);
  receiveFailureTimer = null;
  flash.classList.remove('active');
  document.getElementById('receive-failure-reason')!.textContent = '接球失败';
}

function showReceiveFailure(reason: string): void {
  const flash = document.getElementById('receive-failure-flash')!;
  if (receiveFailureTimer !== null) window.clearTimeout(receiveFailureTimer);
  document.getElementById('receive-failure-reason')!.textContent = `接球失败 · ${reason}`;
  flash.classList.remove('active');
  void flash.offsetWidth;
  flash.classList.add('active');
  receiveFailureTimer = window.setTimeout(() => {
    flash.classList.remove('active');
    receiveFailureTimer = null;
  }, 720);
}

function contactFailureReason(ballPoint: THREE.Vector3, guide: THREE.Vector3, tableImpacts: number, remainingSeconds = 0): string | null {
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  if (TABLE_TECHNIQUES.has(contactTechnique) && tableImpacts > 1) return '错过第二跳前的台内击球时机';
  const lateralError = Math.abs(ballPoint.z - guide.z);
  if (lateralError > 340) return `横向差 ${Math.round(lateralError)} mm，球已超出该手法的可触及范围`;
  if (stanceMode === 'auto') {
    const pose = effectiveStancePose();
    const unfinishedMove = Math.hypot(camera.position.x - pose.x, camera.position.z - pose.z);
    const reachableMovement = remainingSeconds * AUTO_STANCE_MOVE_SPEED_MM_PER_SEC + 280;
    if (unfinishedMove > reachableMovement) return `移动还差 ${Math.round(unfinishedMove)} mm，未能及时到达${pose.label}`;
  } else {
    const forwardReach = Math.abs(camera.position.x - guide.x);
    if (forwardReach > spec.forwardMm + 320) return `固定${VIEW_STANCES[viewStance].label}距离击球点过远`;
  }
  return null;
}

function updateStanceDisplay(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-stance-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.stanceMode === stanceMode);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-view-stance]').forEach(button => {
    button.disabled = stanceMode === 'auto';
  });
  const pose = effectiveStancePose();
  document.getElementById('stance-status')!.innerHTML =
    `<strong>当前身位：</strong>${stanceMode === 'auto' ? `自动 · ${pose.label}` : `固定 · ${pose.label}`}`;
}

function resetAutomaticStance(moveCamera = false): void {
  if (stanceMode !== 'auto') return;
  autoContactZ = configuredContactZ();
  updateStanceDisplay();
  if (moveCamera) applyViewPreset();
}

function moveAutomaticStanceForBall(ballPoint: THREE.Vector3, velocity: { x: number; z: number }, deltaSeconds: number): void {
  if (stanceMode !== 'auto') return;
  const depth = autoStanceDepth(contactTechnique);
  const guideX = TABLE_TECHNIQUES.has(contactTechnique)
    ? CONTACT_TECHNIQUES[contactTechnique].tableContactX ?? 2280
    : depth.x - CONTACT_TECHNIQUES[contactTechnique].forwardMm;
  if (velocity.x > 0.05 && ballPoint.x < guideX) {
    const seconds = (guideX - ballPoint.x) / (velocity.x * 1000);
    if (seconds > 0 && seconds < 1.5) {
      autoContactZ = THREE.MathUtils.clamp(ballPoint.z + velocity.z * 1000 * seconds, TABLE_CENTER_Z - 820, TABLE_CENTER_Z + 820);
    }
  }
  const pose = effectiveStancePose();
  const maximumStep = AUTO_STANCE_MOVE_SPEED_MM_PER_SEC * deltaSeconds;
  const dx = pose.x - camera.position.x;
  const dz = pose.z - camera.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0.5) {
    const scale = Math.min(1, maximumStep / distance);
    camera.position.x += dx * scale;
    camera.position.z += dz * scale;
  }
  updateStanceDisplay();
}

function availableTechniquesForPreset(preset: ShotPreset): ContactTechnique[] {
  const knowledge = getShotKnowledge(preset);
  const short = knowledge.length === 'short';
  const halfLong = knowledge.length === 'half-long';
  const heavyBackspin = preset.topRpm <= -2500;
  const heavyTopspin = preset.topRpm >= 2500;
  const lowSpin = Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm) < 1000;
  const rubber = knowledge.commonRubbers[0];
  if (rubber === 'anti-spin') return ['punch', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'drop-shot', 'long-push'];
  if (rubber === 'long-pips' && lowSpin) return ['punch', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'drop-shot', 'long-push'];
  if (rubber === 'long-pips' && heavyBackspin) return ['forehand-loop', 'backhand-loop', 'lift', 'long-push', 'chop'];
  if (rubber === 'medium-pips') return ['punch', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'block', 'lift'];
  if (rubber === 'short-pips') return ['block', 'forehand-drive', 'counter-loop', 'forehand-loop', 'backhand-loop', 'chop'];
  if (short && heavyBackspin) return ['drop-shot', 'push', 'long-push', 'lift', 'backhand-flick', 'forehand-flick', 'forehand-loop'];
  if (short && heavyTopspin) return ['drop-shot', 'block', 'punch', 'backhand-flick', 'forehand-flick', 'long-push'];
  if (short) return ['drop-shot', 'long-push', 'push', 'lift', 'backhand-flick', 'forehand-flick', 'punch'];
  if (halfLong && heavyBackspin) return ['forehand-loop', 'backhand-loop', 'backhand-flick', 'forehand-flick', 'long-push', 'lift', 'chop'];
  if (heavyBackspin) return ['forehand-loop', 'backhand-loop', 'lift', 'long-push', 'chop'];
  if (heavyTopspin) return ['block', 'counter-loop', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'chop', 'lob'];
  if (preset.id === 'lob') return ['smash', 'forehand-drive', 'forehand-loop', 'backhand-loop', 'drop-shot'];
  if (preset.id === 'smash') return ['block', 'chop', 'lob'];
  return ['forehand-drive', 'punch', 'forehand-loop', 'backhand-loop', 'block', 'counter-loop', 'chop'];
}

function updateTechniqueOptions(): void {
  const available = availableTechniquesForPreset(activePreset);
  if (!available.includes(contactTechnique)) contactTechnique = available[0];
  document.querySelectorAll<HTMLButtonElement>('[data-contact-technique]').forEach(button => {
    const technique = button.dataset.contactTechnique as ContactTechnique;
    button.hidden = !available.includes(technique);
    button.classList.toggle('active', technique === contactTechnique);
    button.title = button.hidden ? '' : `${CONTACT_TECHNIQUES[technique].label}：${CONTACT_TECHNIQUES[technique].timing}`;
  });
  const status = document.getElementById('tracking-status');
  if (status) {
    const labels = available.map(id => CONTACT_TECHNIQUES[id].label).join('、');
    status.dataset.availableTechniques = labels;
  }
}

type ContactGuideState = 'hittable' | 'unreachable';
const contactGuideMaterial = new THREE.MeshBasicMaterial({ color: 0x35e87b, wireframe: true, transparent: true, opacity: 0.95 });
const contactGuideMarker = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 12), contactGuideMaterial);
const actualContactMarker = new THREE.Mesh(
  new THREE.SphereGeometry(34, 18, 14),
  new THREE.MeshBasicMaterial({ color: 0xffd166, wireframe: true, transparent: true, opacity: 0.95 }),
);
const contactLink = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0x54d6ff, dashSize: 45, gapSize: 24, transparent: true, opacity: 0.7 }),
);
const trackingTrailLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0x9ceaff, transparent: true, opacity: 0.82 }),
);
contactGuideMarker.visible = actualContactMarker.visible = contactLink.visible = false;
trackingTrailLine.visible = false;
scene.add(contactGuideMarker, actualContactMarker, contactLink, trackingTrailLine);
let trackingTrailPoints: THREE.Vector3[] = [];

function setContactGuideState(state: ContactGuideState): void {
  contactGuideMaterial.color.setHex(state === 'hittable' ? 0x35e87b : 0xff304f);
  contactGuideMarker.userData.receiveState = state;
  const stanceStatus = document.getElementById('stance-status');
  if (stanceStatus) stanceStatus.dataset.guideState = state;
}

function contactGuidePosition(): THREE.Vector3 {
  const stance = effectiveStancePose();
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  const heightAdjustment = (viewHeightMm - 1600) * 0.22;
  // Once the player has already moved to the wide forehand/backhand lane,
  // the contact point shifts back toward the table centre; otherwise applying
  // the full body-relative offset would place the racket outside the table.
  const lateralMm = stanceMode === 'fixed' && viewStance === 'forehand' && contactTechnique.startsWith('forehand')
    ? 80
    : stanceMode === 'fixed' && viewStance === 'backhand' && contactTechnique === 'backhand-loop'
      ? -80
      : spec.lateralMm;
  return new THREE.Vector3(
    spec.tableContactX ?? stance.x - spec.forwardMm,
    TABLE_TOP_Y + spec.aboveTableMm + heightAdjustment,
    stance.z + lateralMm,
  );
}

function placeContactGuide(point: THREE.Vector3, show: boolean): void {
  const stance = effectiveStancePose();
  contactGuideMarker.position.copy(point);
  contactGuideMarker.visible = show;
  contactLink.visible = show;
  contactLink.geometry.dispose();
  contactLink.geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(stance.x, Math.max(900, viewHeightMm * 0.72), stance.z),
    point,
  ]);
  contactLink.computeLineDistances();
}

function updateContactGuide(show = contactGuideMarker.visible): void {
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  const point = contactGuidePosition();
  placeContactGuide(point, show);
  const available = availableTechniquesForPreset(activePreset)
    .map(id => CONTACT_TECHNIQUES[id].label).join('、');
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${spec.label}</strong>：${spec.description}<br>击球时机：${spec.timing}<br>` +
    `<span style="color:#8fa1b7">当前球路可处理：${available}<br>网状标识球：绿色可处理，红色不可处理</span>`;
  updateStanceDisplay();
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
  const knowledge = getShotKnowledge(activePreset);
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
  const lengthLabel = knowledge.length === 'short' ? '短球/预计台内二跳' : knowledge.length === 'half-long' ? '半出台球' : '长球/出台球';
  const rubberLabels = knowledge.commonRubbers.map(key => RUBBER_PROFILES[key].label).join('、');
  machineDetailEl.innerHTML =
    `<strong>${activePreset.name}</strong> · ${activePreset.description}<br>` +
    `${knowledge.family} · ${lengthLabel}<br><span style="color:#8fa1b7">常见来源：${rubberLabels}</span><br>` +
    `${level.label} · 速度 ${shownSpeed.toFixed(1)}m/s (${Math.round(shownSpeed * 3.6)}km/h)${clearance}${serveRoute}` +
    `<div class="spin-grid">` +
    `<span class="spin-chip">上下旋<b>${signedSpin(activePreset.topRpm * spinFactor, '上旋', '下旋')} rpm</b></span>` +
    `<span class="spin-chip">侧旋<b>${signedSpin(activePreset.sideRpm * spinFactor, '左侧', '右侧')} rpm</b></span>` +
    `<span class="spin-chip">轴向旋转<b>${Math.round(Math.abs(activePreset.corkRpm * spinFactor))} rpm</b></span>` +
    `<span class="spin-chip">合成旋转<b data-testid="composite-spin">${Math.round(solution?.spinRpm ?? nominalSpin)} rpm</b></span>` +
    `</div><button id="parameter-info" class="info-button" type="button">详尽预览与处理方式</button>`;
  document.getElementById('parameter-info')?.addEventListener('click', showParameterDialog);
}

const parameterDialog = document.getElementById('parameter-dialog') as HTMLDialogElement;
function showParameterDialog(): void {
  const settings = readMachineSettings();
  const knowledge = getShotKnowledge(activePreset);
  const level = PLAYER_LEVELS[settings.playerLevel];
  const rpm = Math.round(Math.hypot(activePreset.topRpm, activePreset.sideRpm, activePreset.corkRpm) * level.spinScale);
  const rubberDetails = knowledge.commonRubbers.map(key => {
    const rubber = RUBBER_PROFILES[key];
    return `<li><b>${rubber.label}</b>：${rubber.structure}${rubber.behavior} 常见用途：${rubber.typicalUse}</li>`;
  }).join('');
  const handling = availableTechniquesForPreset(activePreset)
    .map(id => `<li><b>${CONTACT_TECHNIQUES[id].label}</b>：${CONTACT_TECHNIQUES[id].description} 时机：${CONTACT_TECHNIQUES[id].timing}。</li>`)
    .join('');
  document.getElementById('dialog-title')!.textContent = `${activePreset.name} · 参数说明`;
  document.getElementById('dialog-content')!.innerHTML = `
    <p><b>${level.label}</b>：${level.reference}</p>
    <h3>球路身份</h3><ul><li>${knowledge.family}</li><li>平动速度：约 ${(activePreset.speedMps * level.speedScale).toFixed(1)} m/s；合成旋转：约 ${rpm} rpm。</li><li>${activePreset.mode === 'serve' ? '合法发球路线：先落发球方台面，再越网落到接球方。' : '多球/回合球：由发球机直接模拟对手击球后的入射球。'}</li></ul>
    <h3>常见胶皮来源</h3><ul>${rubberDetails}</ul>
    <h3>怎样产生</h3><p>${knowledge.production}</p>
    <h3>飞行与落台</h3><p>${knowledge.flight} ${knowledge.bounce}</p>
    <h3>识别线索</h3><p>${knowledge.readingCues}</p>
    <h3>战术目的</h3><p>${knowledge.tacticalIntent}</p>
    <h3>处理总原则</h3><p>${knowledge.handlingFocus}</p><ul>${handling}</ul>
    <h3>资料与边界</h3><p>胶皮结构按 ITTF 器材规则归类；具体球速、旋转和反弹仍受海绵厚度/硬度、底板、动作、来球和环境影响。参考 <a href="https://documents.ittf.sport/sites/default/files/public/2025-02/2025_ITTF_Statutes_clean_version.pdf" target="_blank" rel="noreferrer">ITTF 2025 器材规则</a>、<a href="https://journals.sagepub.com/doi/10.1177/17543371241310338" target="_blank" rel="noreferrer">不同胶皮实验比较</a>与<a href="https://arxiv.org/abs/2604.11349" target="_blank" rel="noreferrer">多胶皮球拍碰撞建模</a>。</p>`;
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
  updateTechniqueOptions();
  resetAutomaticStance(true);
  updateContactGuide(false);
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
      const knowledge = getShotKnowledge(preset);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset-button';
      button.dataset.preset = preset.id;
      button.style.setProperty('--preset-color', `#${preset.color.toString(16).padStart(6, '0')}`);
      const spin = Math.round(Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm));
      button.title = `${preset.description} ${preset.speedMps}m/s · ${spin}rpm`;
      const rubberLabels = knowledge.commonRubbers.map(key => RUBBER_PROFILES[key].label).join('/');
      button.dataset.tip = `${knowledge.family}｜${preset.description}｜${rubberLabels}｜基准 ${preset.speedMps}m/s｜合成 ${spin}rpm${preset.mode === 'serve' ? '｜合法双落台发球' : ''}`;
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

type TrackingPhase = 'follow-launch' | 'look-back' | 'reacquire' | 'follow-contact' | 'contact-hold' | 'post-contact-source';
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
  contactFailed: boolean;
}
let trackingSession: TrackingSession | null = null;
let trackingEnabled = false;
let trackingContinuous = false;
let trackingAutoReplay = false;
let trackingNextShotAt = 0;
const trackingQueue: RapierBall[] = [];
const trackingTarget = new THREE.Vector3();
const machineLookPoint = new THREE.Vector3();
type IncomingSourceKind = 'machine' | 'opponent-contact';
const incomingSource: {
  kind: IncomingSourceKind;
  label: string;
  note: string;
  position: () => THREE.Vector3;
} = {
  // Future opponent-release tracking can replace this source without
  // changing the camera state machine or contact-point logic.
  kind: 'machine',
  label: '发球机（固定）',
  note: '后续可接入对手出拍位置',
  position: () => new THREE.Vector3(25, machineModel.head.position.y, -762.5),
};
const trackingStartEl = document.getElementById('tracking-start') as HTMLButtonElement;
const trackingContinuousEl = document.getElementById('tracking-continuous') as HTMLInputElement;
const trackingReplayEl = document.getElementById('tracking-replay') as HTMLInputElement;
const trackingReplayPauseEl = document.getElementById('tracking-replay-pause') as HTMLButtonElement;
const trackingSpeedEl = document.getElementById('tracking-speed') as HTMLInputElement;
const trackingSpeedValueEl = document.getElementById('tracking-speed-value')!;
let trackingSpeed = Number(trackingSpeedEl.value);
const SOURCE_TURN_SPEED_DEG_PER_SEC = 180;
interface TrackingSnapshot { time: number; position: THREE.Vector3; }
let trackingRecording: TrackingSnapshot[] = [];
let trackingRecordingStartedAt = 0;
let trackingRecordingFinalized = false;
let trackingReplayMode = false;
let trackingReplayPaused = false;
let trackingReplayTime = 0;
let trackingReplaySourceBall: RapierBall | null = null;
const trackingReplayMesh = new THREE.Mesh(bGeo, ballMaterial);
trackingReplayMesh.visible = false;
scene.add(trackingReplayMesh);

function turnViewAtHumanSpeed(desiredTarget: THREE.Vector3, deltaSeconds: number): void {
  const cameraDistance = Math.max(1, controls.target.distanceTo(camera.position));
  const currentDirection = controls.target.clone().sub(camera.position).normalize();
  const desiredDirection = desiredTarget.clone().sub(camera.position).normalize();
  const maxAngle = THREE.MathUtils.degToRad(SOURCE_TURN_SPEED_DEG_PER_SEC) * deltaSeconds;
  const angle = currentDirection.angleTo(desiredDirection);
  if (angle > maxAngle && angle > 1e-5) {
    const axis = currentDirection.clone().cross(desiredDirection).normalize();
    currentDirection.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, maxAngle));
  } else {
    currentDirection.copy(desiredDirection);
  }
  controls.target.copy(camera.position).addScaledVector(currentDirection, cameraDistance);
}

function finalizeTrackingRecording(): void {
  if (trackingRecording.length < 2) return;
  trackingReplayPauseEl.disabled = true;
}

function stopTrackingReplay(): void {
  if (trackingReplaySourceBall) trackingReplaySourceBall.mesh.visible = true;
  trackingReplaySourceBall = null;
  trackingReplayMode = false;
  trackingReplayPaused = false;
  trackingReplayTime = 0;
  trackingReplayMesh.visible = false;
  trackingReplayPauseEl.disabled = true;
  trackingReplayPauseEl.textContent = '暂停回放';
  syncWindowIndicators();
}

function startTrackingReplay(sourceBall: RapierBall): void {
  if (trackingRecording.length < 2) return;
  trackingSession = null;
  trackingReplaySourceBall = sourceBall;
  if (trackingReplaySourceBall) trackingReplaySourceBall.mesh.visible = false;
  trackingReplayMode = true;
  trackingReplayPaused = false;
  trackingReplayTime = 0;
  trackingReplayMesh.position.copy(trackingRecording[0].position);
  trackingReplayMesh.visible = true;
  controls.enabled = true;
  trackingReplayPauseEl.disabled = false;
  trackingReplayPauseEl.textContent = '暂停回放';
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>慢放回看</strong> · 速度 ${trackingSpeed.toFixed(2)}×<br>` +
    `可暂停在任意位置，也可切换第三人称视角；继续实时跟球会重新进入正常跟球相机。`;
  syncWindowIndicators();
}

function updateTrackingReplay(deltaSeconds: number): void {
  if (!trackingReplayMode || trackingReplayPaused) return;
  trackingReplayTime += deltaSeconds * trackingSpeed;
  const last = trackingRecording[trackingRecording.length - 1];
  const ended = trackingReplayTime >= last.time;
  if (ended) trackingReplayTime = last.time;
  let right = 1;
  while (right < trackingRecording.length && trackingRecording[right].time < trackingReplayTime) right += 1;
  const left = Math.max(0, right - 1);
  const a = trackingRecording[left];
  const b = trackingRecording[Math.min(right, trackingRecording.length - 1)];
  const span = Math.max(1e-6, b.time - a.time);
  trackingReplayMesh.position.lerpVectors(a.position, b.position, THREE.MathUtils.clamp((trackingReplayTime - a.time) / span, 0, 1));
  if (ended) {
    stopTrackingReplay();
    if (trackingEnabled && trackingContinuous) {
      launchNextTrackingBall(performance.now(), true);
    } else if (trackingEnabled) {
      document.getElementById('tracking-status')!.innerHTML =
        `<strong>单球流程完成</strong><br>正常跟球与慢放回看均已结束；关闭再开启可开始下一球。`;
    }
  }
}

function trackingPhaseLabel(phase: TrackingPhase): string {
  if (phase === 'follow-launch') return '跟随来球，寻找最高点';
  if (phase === 'look-back') return '已到最高点，回看发球机';
  if (phase === 'reacquire') return '重新捕捉来球';
  if (phase === 'follow-contact') return '持续跟球至击球点';
  if (phase === 'post-contact-source') return '击球完毕，平滑回看出球点';
  return '击球瞬间已锁定';
}

function setTrackingStatus(phase: TrackingPhase, detail = ''): void {
  const spec = CONTACT_TECHNIQUES[contactTechnique];
  document.getElementById('tracking-status')!.innerHTML =
    `<strong>${trackingPhaseLabel(phase)}</strong> · ${spec.label}<br>` +
    `来球源：${incomingSource.label}；${incomingSource.note}` +
    `${detail ? `<br>${detail}` : `<br>${spec.description}`}`;
  updateStanceDisplay();
}

function updateTrackingControlState(): void {
  trackingStartEl.textContent = trackingEnabled ? '停止跟球' : '开启跟球';
  trackingStartEl.classList.toggle('active', trackingEnabled);
  trackingContinuous = trackingContinuousEl.checked;
  trackingAutoReplay = trackingReplayEl.checked;
  syncWindowIndicators();
}

function stopTrackingDemo(resetStatus = true): void {
  stopTrackingReplay();
  clearReceiveFailureFeedback();
  setContactGuideState('hittable');
  trackingEnabled = false;
  trackingSession = null;
  trackingQueue.length = 0;
  controls.enabled = true;
  contactGuideMarker.visible = false;
  actualContactMarker.visible = false;
  contactLink.visible = false;
  trackingTrailLine.visible = false;
  trackingTrailLine.geometry.dispose();
  trackingTrailLine.geometry = new THREE.BufferGeometry();
  trackingTrailPoints = [];
  if (resetStatus) updateContactGuide(false);
  updateTrackingControlState();
}

function beginTrackingBall(ball: RapierBall, now: number, snapCamera = false, skipSourceGlance = false): void {
  clearReceiveFailureFeedback();
  trackingRecording = [];
  trackingRecordingStartedAt = now;
  trackingRecordingFinalized = false;
  const velocity = ball.body.linvel();
  const position = ball.body.translation();
  trackingSession = {
    ball,
    phase: skipSourceGlance ? 'follow-contact' : 'follow-launch',
    phaseStartedAt: now,
    startedAt: now,
    previousVy: velocity.y,
    apexPoint: new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000),
    actualPoint: new THREE.Vector3(),
    closestPoint: new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000),
    closestDistance: Number.POSITIVE_INFINITY,
    contactFailed: false,
  };
  controls.enabled = false;
  trackingTrailPoints = [];
  trackingTrailLine.visible = true;
  contactGuideMarker.visible = true;
  actualContactMarker.visible = false;
  (actualContactMarker.material as THREE.MeshBasicMaterial).color.setHex(0xffd166);
  trackingTarget.set(position.x * 1000, position.y * 1000, position.z * 1000);
  // Only the first ball establishes the initial eye target. During continuous
  // tracking, keep the previous contact target and let the normal camera
  // interpolation acquire the next ball without a sudden viewpoint jump.
  if (snapCamera) controls.target.copy(trackingTarget);
  const initialGuide = contactGuidePosition();
  const initialFailure = contactFailureReason(initialGuide, initialGuide, 1, 1);
  setContactGuideState(initialFailure ? 'unreachable' : 'hittable');
  updateTrackingControlState();
  setTrackingStatus('follow-launch');
}

function launchNextTrackingBall(now: number, restoreFollowView = false): void {
  if (!trackingEnabled) return;
  resetAutomaticStance();
  if (restoreFollowView) applyViewPreset();
  updateContactGuide(true);
  const ball = feedMachine(activePreset, true);
  if (!ball) {
    stopTrackingDemo();
    return;
  }
  beginTrackingBall(ball, now, restoreFollowView, !restoreFollowView);
  trackingNextShotAt = now + 1000 / readMachineSettings().cadence;
}

async function startTrackingDemo(): Promise<void> {
  if (!isReady()) return;
  await clearBalls();
  setMachineRunning(false);
  trackingEnabled = true;
  trackingContinuous = trackingContinuousEl.checked;
  trackingAutoReplay = trackingReplayEl.checked;
  trackingQueue.length = 0;
  resetAutomaticStance();
  applyViewPreset();
  // A tracking demo follows exactly what the machine is configured to throw:
  // no hidden preset, lane, or randomization override. If the selected stance
  // cannot handle that ball, the demo must expose the miss instead of adapting
  // the incoming ball to make the technique look successful.
  launchNextTrackingBall(performance.now(), true);
  updateTrackingControlState();
}

function updateTrackingDemo(now: number, deltaSeconds: number): void {
  const session = trackingSession;
  if (!session) return;
  if (!getBalls().includes(session.ball)) {
    stopTrackingDemo();
    return;
  }
  const position = session.ball.body.translation();
  const velocity = session.ball.body.linvel();
  const ballPoint = new THREE.Vector3(position.x * 1000, position.y * 1000, position.z * 1000);
  if (!trackingRecordingFinalized) {
    trackingRecording.push({ time: (now - trackingRecordingStartedAt) / 1000, position: ballPoint.clone() });
  }
  const lastTrailPoint = trackingTrailPoints[trackingTrailPoints.length - 1];
  if (!lastTrailPoint || lastTrailPoint.distanceTo(ballPoint) > 18) {
    trackingTrailPoints.push(ballPoint.clone());
    if (trackingTrailPoints.length > 360) trackingTrailPoints.shift();
    trackingTrailLine.geometry.dispose();
    trackingTrailLine.geometry = new THREE.BufferGeometry().setFromPoints(trackingTrailPoints);
  }
  const elapsedInPhase = now - session.phaseStartedAt;
  const visualElapsedInPhase = elapsedInPhase;
  moveAutomaticStanceForBall(ballPoint, velocity, deltaSeconds);
  const guide = contactGuidePosition();
  let trajectoryGuide = guide;
  let secondsToGuide = 0;
  let hasTrajectoryProjection = false;
  // Once the ball has bounced, project the elite body-relative contact plane
  // onto the current physical flight path. The cyan marker therefore sits on
  // the actual arc instead of floating at an unrelated fixed height.
  if (session.ball.tableImpacts > 0 && velocity.x > 0.05 && position.x * 1000 < guide.x) {
    const timeToPlane = (guide.x / 1000 - position.x) / velocity.x;
    const projected = new THREE.Vector3(
      guide.x,
      ballPoint.y + velocity.y * 1000 * timeToPlane - 0.5 * 9810 * timeToPlane ** 2,
      ballPoint.z + velocity.z * 1000 * timeToPlane,
    );
    if (timeToPlane > 0 && timeToPlane < 1.5 && projected.y > TABLE_TOP_Y + BALL_RADIUS && projected.y < 2400) {
      trajectoryGuide = projected;
      secondsToGuide = timeToPlane;
      hasTrajectoryProjection = true;
      if (contactGuideMarker.visible) placeContactGuide(projected, true);
    }
  }
  if (hasTrajectoryProjection && session.phase !== 'contact-hold' && session.phase !== 'post-contact-source') {
    const predictedFailure = contactFailureReason(
      trajectoryGuide,
      guide,
      Math.max(1, session.ball.tableImpacts),
      secondsToGuide,
    );
    setContactGuideState(predictedFailure ? 'unreachable' : 'hittable');
  }
  const distanceToGuide = ballPoint.distanceTo(trajectoryGuide);
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
    machineLookPoint.copy(incomingSource.position());
    trackingTarget.lerp(machineLookPoint, 0.13);
    if (visualElapsedInPhase > 520) {
      session.phase = 'reacquire';
      session.phaseStartedAt = now;
      setTrackingStatus('reacquire');
    }
  } else if (session.phase === 'reacquire') {
    trackingTarget.lerp(ballPoint, 0.2);
    if (visualElapsedInPhase > 300) {
      session.phase = 'follow-contact';
      session.phaseStartedAt = now;
      setTrackingStatus('follow-contact', `蓝色标记为${CONTACT_TECHNIQUES[contactTechnique].timing}的基准击球点。`);
    }
  } else if (session.phase === 'follow-contact') {
    trackingTarget.copy(ballPoint);
    const hasRequiredBounce = !TABLE_TECHNIQUES.has(contactTechnique) || session.ball.tableImpacts >= 1;
    if (position.x * 1000 >= guide.x && hasRequiredBounce) {
      session.phase = 'contact-hold';
      session.phaseStartedAt = now;
      session.actualPoint.copy(ballPoint);
      actualContactMarker.position.copy(ballPoint);
      actualContactMarker.visible = true;
      const offset = ballPoint.distanceTo(trajectoryGuide);
      const delta = ballPoint.clone().sub(guide);
      const bounceNote = TABLE_TECHNIQUES.has(contactTechnique) ? `第 ${session.ball.tableImpacts} 次落台后、第二跳前。` : '';
      const failureReason = contactFailureReason(ballPoint, guide, session.ball.tableImpacts);
      if (failureReason) {
        session.contactFailed = true;
        setContactGuideState('unreachable');
        (actualContactMarker.material as THREE.MeshBasicMaterial).color.setHex(0xff304f);
        showReceiveFailure(failureReason);
        setTrackingStatus('contact-hold', `接球失败：${failureReason}。红色标记为错过击球窗口时的球位置。`);
      } else {
        setContactGuideState('hittable');
        setTrackingStatus('contact-hold', `${bounceNote}黄色标记为实际球到达击球平面的瞬间；与精英基准点相差 ${Math.round(offset)} mm（高度 ${Math.round(delta.y)} / 横向 ${Math.round(delta.z)} mm）。`);
      }
    } else if (session.ball.tableImpacts > 0 && (position.y < 0.08 || velocity.x <= 0)) {
      session.phase = 'contact-hold';
      session.phaseStartedAt = now;
      session.contactFailed = true;
      setContactGuideState('unreachable');
      session.actualPoint.copy(session.closestPoint);
      actualContactMarker.position.copy(session.closestPoint);
      actualContactMarker.visible = true;
      (actualContactMarker.material as THREE.MeshBasicMaterial).color.setHex(0xff304f);
      const reason = '当前身位无法进入该球的标准击球窗口';
      showReceiveFailure(reason);
      setTrackingStatus('contact-hold', `接球失败：${reason}；红色标记为最接近点。`);
    }
  } else if (session.phase === 'contact-hold') {
    trackingTarget.copy(session.actualPoint);
    if (elapsedInPhase > 140) {
      session.phase = 'post-contact-source';
      session.phaseStartedAt = now;
      setTrackingStatus('post-contact-source', session.contactFailed
        ? `本球处理失败，视线仍按真实反应回看${incomingSource.label}，再准备下一球。`
        : `击球完成，先回看${incomingSource.label}，再捕捉下一球。`);
    }
  }

  if (session.phase === 'post-contact-source') {
    trackingTarget.copy(incomingSource.position());
    if (elapsedInPhase > 420) {
      if (trackingAutoReplay && trackingRecordingFinalized) {
        startTrackingReplay(session.ball);
        return;
      }
      if (trackingContinuous && trackingQueue.length > 0) {
        beginTrackingBall(trackingQueue.shift()!, now, false, true);
        return;
      }
    }
  }

  if (!trackingRecordingFinalized && session.phase === 'contact-hold') {
    trackingRecordingFinalized = true;
    finalizeTrackingRecording();
  }

  session.previousVy = velocity.y;
  if (session.phase === 'post-contact-source') {
    turnViewAtHumanSpeed(trackingTarget, deltaSeconds);
  } else {
    controls.target.lerp(trackingTarget, session.phase === 'contact-hold' ? 0.22 : 0.30);
  }
}

function feedContinuousTrackingBall(now: number): void {
  if (!trackingEnabled || !trackingContinuous || trackingAutoReplay || trackingReplayMode || now < trackingNextShotAt) return;
  const ball = feedMachine(activePreset, true);
  if (ball) trackingQueue.push(ball);
  trackingNextShotAt = now + 1000 / readMachineSettings().cadence;
}

function setMachineRunning(running: boolean): void {
  if (running) stopTrackingDemo();
  machineRunning = running;
  nextMachineShotAt = performance.now();
  machineToggleEl.classList.toggle('active', running);
  machineToggleEl.textContent = running ? '暂停连续 [P]' : '连续发球 [P]';
  machineStatusEl.textContent = running ? '运行中' : '已停止';
  machineStatusEl.classList.toggle('running', running);
  syncWindowIndicators();
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
laneEl.addEventListener('change', () => {
  updateMachineDetails();
  resetAutomaticStance(true);
  updateContactGuide();
});
levelEl.addEventListener('change', () => updateMachineDetails());
randomizeEl.addEventListener('change', () => updateMachineDetails());
ballStyleEl.addEventListener('change', () => setBallStyle(ballStyleEl.value as BallStyle));
document.querySelectorAll<HTMLButtonElement>('[data-contact-technique]').forEach(button => {
  button.addEventListener('click', () => {
    const wasTracking = trackingEnabled;
    contactTechnique = button.dataset.contactTechnique as ContactTechnique;
    document.querySelectorAll<HTMLButtonElement>('[data-contact-technique]').forEach(item => {
      item.classList.toggle('active', item === button);
    });
    resetAutomaticStance(true);
    updateContactGuide(wasTracking);
    if (wasTracking) void startTrackingDemo();
  });
});
trackingStartEl.addEventListener('click', () => {
  if (trackingEnabled) {
    stopTrackingDemo();
  } else {
    void startTrackingDemo();
  }
});
trackingContinuousEl.addEventListener('change', () => {
  trackingContinuous = trackingContinuousEl.checked;
  if (!trackingContinuous) {
    trackingQueue.length = 0;
  } else if (trackingEnabled && !trackingAutoReplay && !trackingReplayMode) {
    trackingNextShotAt = performance.now() + 1000 / readMachineSettings().cadence;
  }
  updateTrackingControlState();
});
trackingReplayEl.addEventListener('change', () => {
  trackingAutoReplay = trackingReplayEl.checked;
  if (trackingAutoReplay) {
    trackingQueue.length = 0;
  } else if (trackingReplayMode) {
    stopTrackingReplay();
    if (trackingEnabled && trackingContinuous) launchNextTrackingBall(performance.now(), true);
  }
  updateTrackingControlState();
});
trackingSpeedEl.addEventListener('input', () => {
  trackingSpeed = Number(trackingSpeedEl.value);
  trackingSpeedValueEl.textContent = `${trackingSpeed.toFixed(2)}×`;
});
trackingReplayPauseEl.addEventListener('click', () => {
  if (!trackingReplayMode) return;
  trackingReplayPaused = !trackingReplayPaused;
  trackingReplayPauseEl.textContent = trackingReplayPaused ? '继续回放' : '暂停回放';
});
setBallStyle(ballStyleEl.value as BallStyle);

// ==================== Topspin demonstration ====================
const demoPowerEl = document.getElementById('demo-power') as HTMLInputElement;
const demoSpinEl = document.getElementById('demo-spin') as HTMLInputElement;
const demoSideEl = document.getElementById('demo-side') as HTMLInputElement;
const demoLines: THREE.Line[] = [];
let demoActive = false;
updateTrackingControlState();

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
  syncWindowIndicators();
}
demoPowerEl.addEventListener('input', updateDemo);
demoSpinEl.addEventListener('input', updateDemo);
demoSideEl.addEventListener('input', updateDemo);
document.getElementById('demo-preview')!.addEventListener('click', () => {
  demoActive = true;
  setMachineVisible(false);
  updateDemo();
  syncWindowIndicators();
});
document.getElementById('demo-fire')!.addEventListener('click', fireDemo);
updateDemo();
syncWindowIndicators();

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

  feedContinuousTrackingBall(now);

  // Tracking slow motion never changes this physical time step. The ball
  // follows the same trajectory; only camera phase timing/interpolation uses
  // trackingSpeed.
  physicsStep(elapsedMs / 1000);
  syncMeshes();
  updateTrackingDemo(now, elapsedMs / 1000);
  updateTrackingReplay(elapsedMs / 1000);

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
