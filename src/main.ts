import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { createIcons, MousePointer2, ArrowDown, X } from 'lucide';
import { init as initPhysics, isReady, createBall, removeBall, clearAllBalls, getBalls, step as physicsStep, syncMeshes, getBallCount } from './physics';
import {
  SHOT_CATEGORIES,
  SHOT_PRESETS,
  getPreset,
  solveLaunch,
  type LaunchSolution,
  type MachineSettings,
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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
c.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xaabbcc, 5));
const sun = new THREE.DirectionalLight(0xffeedd, 8);
sun.position.set(1500, 3000, 2000);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 15000;
sun.shadow.camera.left = -4000; sun.shadow.camera.right = 4000;
sun.shadow.camera.top = 4000; sun.shadow.camera.bottom = -4000;
scene.add(sun);
scene.add(new THREE.DirectionalLight(0xaaccff, 3));

const grid = new THREE.PolarGridHelper(2500, 32, 24, 64, 0x334455, 0x222244);
grid.position.set(1370, -3, -762); scene.add(grid);
const gp = new THREE.Mesh(
  new THREE.PlaneGeometry(6000, 6000),
  new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 }),
);
gp.rotation.x = -Math.PI / 2; gp.position.set(1370, -5, -762);
gp.receiveShadow = true; scene.add(gp);

const CTR = new THREE.Vector3(1370, 380, -762);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 500; controls.maxDistance = 12000;
controls.target.copy(CTR); controls.update();

// ==================== Balls ====================
const bGeo = new THREE.SphereGeometry(20, 32, 32);

function makeMat(color?: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: color ?? new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 1, 0.45 + Math.random() * 0.15),
    metalness: 0.05, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.1,
  });
}

const TABLE_TOP_Y = 785;
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
  const mesh = new THREE.Mesh(bGeo, makeMat(color));
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
let activePreset: ShotPreset = getPreset('float-long');
let machineRunning = false;
let nextMachineShotAt = 0;
let machineShotCount = 0;
let machineLandingCount = 0;

const presetGroupsEl = document.getElementById('preset-groups')!;
const strengthEl = document.getElementById('machine-strength') as HTMLInputElement;
const cadenceEl = document.getElementById('machine-cadence') as HTMLInputElement;
const laneEl = document.getElementById('machine-lane') as HTMLSelectElement;
const randomizeEl = document.getElementById('machine-randomize') as HTMLInputElement;
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

function createMachineModel(): { group: THREE.Group; head: THREE.Group } {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x252b3a, metalness: 0.65, roughness: 0.32 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff9f43, metalness: 0.25, roughness: 0.28 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(280, 70, 300), dark);
  base.position.set(-290, 35, -762.5);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(28, 42, 950, 20), dark);
  mast.position.set(-290, 510, -762.5);
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
  group.add(base, mast, head);
  group.traverse(object => {
    if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
  });
  scene.add(group);
  return { group, head };
}

const machineModel = createMachineModel();

function readMachineSettings(): MachineSettings {
  return {
    strength: Number(strengthEl.value) / 100,
    cadence: Number(cadenceEl.value),
    targetLane: laneEl.value as TargetLane,
    randomize: randomizeEl.checked,
  };
}

function updateMachineDetails(solution?: LaunchSolution): void {
  const settings = readMachineSettings();
  const nominalSpeed = activePreset.speedMps * settings.strength;
  const nominalSpin = Math.hypot(
    activePreset.topRpm,
    activePreset.sideRpm,
    activePreset.corkRpm,
  ) * (0.75 + 0.25 * settings.strength);
  strengthValueEl.textContent = `${Math.round(settings.strength * 100)}%`;
  cadenceValueEl.textContent = `${settings.cadence.toFixed(1)} 球/秒`;
  const clearance = solution ? ` · 过网余量 ${Math.round(solution.netClearanceMm)}mm` : '';
  machineDetailEl.innerHTML =
    `<strong>${activePreset.name}</strong> · ${activePreset.description}<br>` +
    `速度 ${nominalSpeed.toFixed(1)}m/s (${Math.round(nominalSpeed * 3.6)}km/h)` +
    ` · 合成旋转 ${Math.round(nominalSpin)}rpm${clearance}`;
}

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
      button.title = `${preset.description}  ${preset.speedMps}m/s · ${Math.round(Math.hypot(preset.topRpm, preset.sideRpm, preset.corkRpm))}rpm`;
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

function feedMachine(preset = activePreset): void {
  if (!isReady()) return;
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
  if (!ball) return;
  ball.body.setAngvel(solution.angularVelocity, true);
  machineBallMeta.set(ball.body, { presetId: preset.id, countedLanding: false });
  machineModel.head.position.y = solution.originMm.y;
  targetMarker.position.set(solution.targetMm.x, TABLE_TOP_Y + 2, solution.targetMm.z);
  targetMarker.visible = true;
  machineShotCount += 1;
  document.getElementById('machine-shot-count')!.textContent = String(machineShotCount);
  updateMachineDetails(solution);
}

function setMachineRunning(running: boolean): void {
  machineRunning = running;
  nextMachineShotAt = performance.now();
  machineToggleEl.classList.toggle('active', running);
  machineToggleEl.textContent = running ? '暂停连续 [P]' : '连续发球 [P]';
  machineStatusEl.textContent = running ? '运行中' : '已停止';
  machineStatusEl.classList.toggle('running', running);
}

resetMachineOnClear = () => {
  setMachineRunning(false);
  targetMarker.visible = false;
};

renderPresetButtons();
setActivePreset(activePreset);
machineOnceEl.addEventListener('click', () => feedMachine());
machineToggleEl.addEventListener('click', () => setMachineRunning(!machineRunning));
strengthEl.addEventListener('input', () => updateMachineDetails());
cadenceEl.addEventListener('input', () => updateMachineDetails());
laneEl.addEventListener('change', () => updateMachineDetails());
randomizeEl.addEventListener('change', () => updateMachineDetails());

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

  physicsStep(elapsedMs / 1000);
  syncMeshes();

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
      });
    } else {
      delete counter.dataset.telemetry;
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
    if (all[i].t > 30) {
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
    camera.position.set(4000, 2500, 3500);
    controls.target.copy(CTR);
    controls.update();
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
    await loadSTL('table-surface.stl', 0x1a5c2a, 0.02, 0.6, 1);
    await loadSTL('table-frame.stl', 0x555555, 0.3, 0.4, 1);
    await loadSTL('table-legs.stl', 0x5a5a6e, 0.3, 0.35, 1);
    await loadSTL('table-net.stl', 0xdddddd, 0.15, 0.3, 0.7);
    msg.remove();
  } catch (e: any) {
    msg.textContent = '加载失败: ' + e.message;
    console.error(e);
  }
})();
