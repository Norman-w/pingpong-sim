import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { createIcons, MousePointer2, ArrowDown, X } from 'lucide';
import { init as initPhysics, createBall, removeBall, clearAllBalls, getBalls, step as physicsStep, syncMeshes, getBallCount } from './physics';

createIcons({
  icons: { MousePointer2, ArrowDown, X },
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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
c.appendChild(renderer.domElement);

// Lighting
scene.add(new THREE.AmbientLight(0xaabbcc, 5));
const sun = new THREE.DirectionalLight(0xffeedd, 8);
sun.position.set(1500, 3000, 2000);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 15000;
sun.shadow.camera.left = -4000;
sun.shadow.camera.right = 4000;
sun.shadow.camera.top = 4000;
sun.shadow.camera.bottom = -4000;
scene.add(sun);
scene.add(new THREE.DirectionalLight(0xaaccff, 3));

// Ground grid + plane
const grid = new THREE.PolarGridHelper(2500, 32, 24, 64, 0x334455, 0x222244);
grid.position.set(1370, -3, -762);
scene.add(grid);
const gp = new THREE.Mesh(
  new THREE.PlaneGeometry(6000, 6000),
  new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 }),
);
gp.rotation.x = -Math.PI / 2;
gp.position.set(1370, -5, -762);
gp.receiveShadow = true;
scene.add(gp);

// Controls
const CTR = new THREE.Vector3(1370, 380, -762);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 500;
controls.maxDistance = 12000;
controls.target.copy(CTR);
controls.update();

// ==================== Physics World ====================
// Rapier3D handles all collision, friction, CCD, angular dynamics
const physicsReady = initPhysics().catch((e: any) => {
  console.error('[pingpong] Rapier init failed:', e);
  const msg = document.getElementById('load-msg');
  if (msg) msg.textContent = '物理引擎加载失败: ' + String(e.message || e);
  return Promise.reject(e);
});

// Ball visual geometry (shared)
const R = 20;
const bGeo = new THREE.SphereGeometry(R, 32, 32);

function makeMat(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 1, 0.45 + Math.random() * 0.15),
    metalness: 0.05, roughness: 0.3,
    clearcoat: 0.3, clearcoatRoughness: 0.1,
  });
}

// Spawn point: forehand half middle, 6m high
const SPX = 2055, SPZ = -762, SPY = 6000;

async function dropBall(): Promise<void> {
  await physicsReady;
  const x = SPX + (Math.random() - 0.5) * 200;
  const y = SPY + Math.random() * 500;
  const z = SPZ + (Math.random() - 0.5) * 300;

  const mesh = new THREE.Mesh(bGeo, makeMat());
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  scene.add(mesh);

  createBall(x, y, z, 0, 0, 0, mesh);
  document.getElementById('bc')!.textContent = String(getBallCount());
}

async function dropBalls(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    setTimeout(() => dropBall(), i * 150);
  }
}

async function clearBalls(): Promise<void> {
  await physicsReady;
  for (const b of getBalls()) {
    scene.remove(b.mesh);
  }
  clearAllBalls();
  document.getElementById('bc')!.textContent = '0';
}

Object.assign(window, { dropBall, dropBalls, clearBalls });

// ==================== Animation Loop ====================
let frames = 0, ft = 0, fps = 0, lastT = performance.now();

function animate(): void {
  requestAnimationFrame(animate);

  // Physics step (safe to call before init — becomes no-op)
  physicsStep();
  syncMeshes();

  const now = performance.now();
  const elapsed = now - lastT;
  lastT = now;

  frames++;
  ft += elapsed;
  if (ft >= 500) {
    fps = Math.round(frames / (ft / 1000));
    frames = 0; ft = 0;
    document.getElementById('fps')!.textContent = String(fps);
  }
  controls.update();
  renderer.render(scene, camera);
}

// Remove old balls (every 5s)
setInterval(async () => {
  await physicsReady;
  const all = getBalls();
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].t > 30000) {
      scene.remove(all[i].mesh);
      removeBall(all[i]);
    }
  }
  // Tick lifespan
  for (const b of all) b.t += 5;
  document.getElementById('bc')!.textContent = String(getBallCount());
}, 5000);

animate();

window.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    dropBall();
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
