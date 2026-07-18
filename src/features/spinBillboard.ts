//#region 导入/依赖
import * as THREE from 'three';

//#endregion

//#region 常量/配置
const SPIN_BILLBOARD_WIDTH = 512;
const SPIN_BILLBOARD_HEIGHT = 168;
//#endregion

//#region 模型/类型
export interface SpinBillboardApi {
  show: (cueLabel: string, angularVelocity: THREE.Vector3, targetPosition: THREE.Vector3) => void;
  hide: () => void;
  syncPosition: (targetPosition: THREE.Vector3) => void;
}
//#endregion

//#region 私有成员
function signedSpin(value: number, positive: string, negative: string): string {
  if (Math.abs(value) < 1) return '0';
  return `${value > 0 ? positive : negative} ${Math.round(Math.abs(value))}`;
}

function replaySpinComponents(angularVelocity: THREE.Vector3): {
  compositeRpm: number;
  topRpm: number;
  sideRpm: number;
  corkRpm: number;
} {
  const radToRpm = 60 / (2 * Math.PI);
  return {
    compositeRpm: angularVelocity.length() * radToRpm,
    topRpm: -angularVelocity.z * radToRpm,
    sideRpm: angularVelocity.y * radToRpm,
    corkRpm: angularVelocity.x * radToRpm,
  };
}
//#endregion

//#region 公开 API
export function formatSpinRpm(angularVelocity: THREE.Vector3): string {
  const spin = replaySpinComponents(angularVelocity);
  return (
    `合成旋转 <b>${Math.round(spin.compositeRpm)} rpm</b>` +
    ` · 上下旋 ${signedSpin(spin.topRpm, '上旋', '下旋')} rpm` +
    ` · 侧旋 ${signedSpin(spin.sideRpm, '左侧', '右侧')} rpm` +
    ` · 轴向 ${Math.round(Math.abs(spin.corkRpm))} rpm`
  );
}

export function initSpinBillboard(scene: THREE.Scene): SpinBillboardApi {
  const canvas = document.createElement('canvas');
  canvas.width = SPIN_BILLBOARD_WIDTH;
  canvas.height = SPIN_BILLBOARD_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  sprite.scale.set(320, 105, 1);
  sprite.visible = false;
  sprite.renderOrder = 30;
  scene.add(sprite);

  function syncPosition(targetPosition: THREE.Vector3): void {
    if (!sprite.visible) return;
    sprite.position.copy(targetPosition);
    sprite.position.x += 55;
    sprite.position.y += 70;
  }

  function hide(): void {
    sprite.visible = false;
  }

  function show(cueLabel: string, angularVelocity: THREE.Vector3, targetPosition: THREE.Vector3): void {
    const spin = replaySpinComponents(angularVelocity);
    const w = SPIN_BILLBOARD_WIDTH;
    const h = SPIN_BILLBOARD_HEIGHT;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12, 16, 28, 0.88)';
    ctx.strokeStyle = 'rgba(84, 214, 255, 0.7)';
    ctx.lineWidth = 4;
    const radius = 18;
    ctx.beginPath();
    ctx.moveTo(radius, 8);
    ctx.arcTo(w - 8, 8, w - 8, h - 8, radius);
    ctx.arcTo(w - 8, h - 8, 8, h - 8, radius);
    ctx.arcTo(8, h - 8, 8, 8, radius);
    ctx.arcTo(8, 8, w - 8, 8, radius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#9ceaff';
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.fillText(cueLabel, 28, 48);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText(`${Math.round(spin.compositeRpm)} rpm`, 28, 98);
    ctx.fillStyle = '#b7c7d6';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(
      `${signedSpin(spin.topRpm, '上旋', '下旋')}  ${signedSpin(spin.sideRpm, '左侧', '右侧')}  轴向 ${Math.round(Math.abs(spin.corkRpm))}`,
      28,
      138,
    );
    texture.needsUpdate = true;
    sprite.visible = true;
    syncPosition(targetPosition);
  }

  return { show, hide, syncPosition };
}
//#endregion

//#region 业务逻辑
//#endregion

//#region 方法/工具
//#endregion
