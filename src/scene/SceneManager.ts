import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CameraController } from './CameraController';
import { Environment } from './Environment';
import { Animator } from './Animator';

export class SceneManager {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  cameraController: CameraController;
  environment: Environment;
  animator = new Animator();
  /** 遊戲速度倍率（動畫跟著加快） */
  timeScale = 1;

  private timer = new THREE.Timer();
  private updaters: ((dt: number, time: number) => void)[] = [];
  private raycaster = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  private downPos = { x: 0, y: 0 };
  onPick: ((obj: THREE.Object3D | null) => void) | null = null;
  onHover: ((obj: THREE.Object3D | null, e: PointerEvent) => void) | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(window.innerWidth, window.innerHeight);
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 1000);
    this.cameraController = new CameraController(this.camera, this.renderer.domElement);
    this.environment = new Environment(this.scene);

    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    this.renderer.domElement.addEventListener('pointerdown', (e) => (this.downPos = { x: e.clientX, y: e.clientY }));
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      // 拖曳視角時不算點擊
      if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > 6) return;
      this.onPick?.(this.pick(e));
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const hit = this.pick(e);
      this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
      this.onHover?.(hit, e);
    });
  }

  setPickables(list: THREE.Object3D[]) {
    this.pickables = list;
  }

  private pick(e: PointerEvent): THREE.Object3D | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o && o.visible) return o;
    }
    return null;
  }

  onUpdate(fn: (dt: number, time: number) => void) {
    this.updaters.push(fn);
  }

  start() {
    this.renderer.setAnimationLoop((timestamp) => {
      this.timer.update(timestamp);
      const dt = Math.min(this.timer.getDelta(), 0.1);
      this.animator.update(dt * this.timeScale);
      for (const u of this.updaters) u(dt, this.animator.time);
      this.environment.update(dt);
      this.cameraController.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    });
  }

  private resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labels.setSize(window.innerWidth, window.innerHeight);
  }
}
