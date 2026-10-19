import * as THREE from 'three';
import { MAP_SCALE } from '../data/board';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * 斜上方策略視角
 * 左鍵拖曳：旋轉｜右鍵拖曳：平移｜滾輪：縮放｜WASD / 方向鍵：移動視角
 */
export class CameraController {
  controls: OrbitControls;
  private focusTarget: THREE.Vector3 | null = null;
  private keys = new Set<string>();

  constructor(
    private camera: THREE.OrthographicCamera,
    dom: HTMLElement,
  ) {
    camera.position.set(-183.7117,150,183.7117);
    this.controls = new OrbitControls(camera, dom);
    this.controls.target.set(0,0,0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 160 * MAP_SCALE;
    this.controls.minPolarAngle = this.controls.maxPolarAngle = Math.PI/3;
    this.controls.minAzimuthAngle = this.controls.maxAzimuthAngle = -Math.PI/4;
    this.controls.enableRotate=false;
    this.controls.minZoom=.2;this.controls.maxZoom=8;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.update();
    const toolbar=document.createElement('div');toolbar.className='map-camera-tools';
    toolbar.innerHTML='<span>45°方位 · 30°俯角</span><button type="button">全圖</button><button type="button">＋</button><button type="button">－</button><button type="button">地名</button><button type="button">純地圖</button>';
    const buttons=toolbar.querySelectorAll('button');
    buttons[0].onclick=()=>{this.focusTarget=null;this.controls.target.set(0,0,0);camera.position.set(-183.7117,150,183.7117);camera.zoom=Math.min((camera.right-camera.left)/416,180/222)*.92;camera.updateProjectionMatrix();this.controls.update();};
    buttons[1].onclick=()=>{camera.zoom=Math.min(8,camera.zoom*1.3);camera.updateProjectionMatrix();};
    buttons[2].onclick=()=>{camera.zoom=Math.max(.2,camera.zoom/1.3);camera.updateProjectionMatrix();};
    buttons[3].onclick=()=>{document.body.classList.toggle('map-all-names');buttons[3].setAttribute('aria-pressed',String(document.body.classList.contains('map-all-names')));};
    buttons[4].onclick=()=>{const pure=document.body.classList.toggle('map-inspection');buttons[4].textContent=pure?'返回遊戲':'純地圖';};
    toolbar.addEventListener('keydown',e=>e.stopPropagation());
    document.body.append(toolbar);

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    // 使用者手動操作時取消跟隨
    this.controls.addEventListener('start', () => (this.focusTarget = null));
  }

  /** 平滑地把鏡頭移到目標 */
  focus(p: THREE.Vector3) {
    this.focusTarget = p.clone();
  }

  /** 持續跟隨（每幀更新目標） */
  follow(p: THREE.Vector3) {
    this.focusTarget = p.clone();
  }

  update(dt: number) {
    document.body.classList.toggle('map-overview',this.camera.zoom<1.2);
    const move = new THREE.Vector3();
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) move.z -= 1;
    if (k.has('s') || k.has('arrowdown')) move.z += 1;
    if (k.has('a') || k.has('arrowleft')) move.x -= 1;
    if (k.has('d') || k.has('arrowright')) move.x += 1;
    if (move.lengthSq() > 0) {
      this.focusTarget = null;
      // 依鏡頭朝向換算
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
      const delta = forward.multiplyScalar(-move.z).add(right.multiplyScalar(move.x));
      delta.normalize().multiplyScalar(dt * 30);
      this.camera.position.add(delta);
      this.controls.target.add(delta);
    }

    if (this.focusTarget) {
      const t = this.controls.target;
      const delta = this.focusTarget.clone().sub(t).multiplyScalar(Math.min(1, dt * 4));
      t.add(delta);
      this.camera.position.add(delta);
      if (this.focusTarget.distanceTo(t) < 0.05) this.focusTarget = null;
    }

    // 限制在地圖範圍
    const t = this.controls.target;
    const cx = THREE.MathUtils.clamp(t.x, -130, 130) - t.x;
    const cz = THREE.MathUtils.clamp(t.z, -130, 130) - t.z;
    if (cx || cz) {
      t.x += cx;
      t.z += cz;
      this.camera.position.x += cx;
      this.camera.position.z += cz;
    }
    this.controls.update();
  }
}
