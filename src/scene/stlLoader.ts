//#region 导入/依赖
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
//#endregion

//#region 常量/配置
const BASE = import.meta.env.BASE_URL;
//#endregion

//#region 模型/类型
//#endregion

//#region 私有成员
const loader = new STLLoader();
//#endregion

//#region 公开 API
export function loadSceneStls(scene: THREE.Scene): void {
  const msg = document.createElement('div');
  msg.id = 'load-msg';
  msg.style.cssText =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#8899aa;font-size:14px;z-index:100;';
  msg.textContent = '加载模型中...';
  document.body.appendChild(msg);

  void (async () => {
    try {
      await loadSTL(scene, 'table-surface.stl', 0x0b0d12, 0.02, 0.48, 1);
      await loadSTL(scene, 'table-frame.stl', 0x555555, 0.3, 0.4, 1);
      await loadSTL(scene, 'table-legs.stl', 0x5a5a6e, 0.3, 0.35, 1);
      await loadSTL(scene, 'table-net.stl', 0xdddddd, 0.15, 0.3, 0.7);
      msg.remove();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      msg.textContent = '加载失败: ' + message;
      console.error(e);
    }
  })();
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
function loadSTL(
  scene: THREE.Scene,
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
//#endregion
