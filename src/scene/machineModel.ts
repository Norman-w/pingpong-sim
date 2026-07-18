//#region 导入/依赖
import * as THREE from 'three';
//#endregion

//#region 常量/配置
//#endregion

//#region 模型/类型
export interface MachineModel {
  group: THREE.Group;
  head: THREE.Group;
  upperMast: THREE.Mesh;
}
//#endregion

//#region 私有成员
//#endregion

//#region 公开 API
export function createMachineModel(scene: THREE.Scene): MachineModel {
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
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
