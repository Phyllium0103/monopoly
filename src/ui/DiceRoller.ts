import {
  ACESFilmicToneMapping, AmbientLight, Box3, DirectionalLight, Group, HemisphereLight, Mesh,
  OrthographicCamera, PCFShadowMap, PlaneGeometry, Scene, ShadowMaterial, SRGBColorSpace,
  Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../data/assetUrl';
import { dicePlaybackRate, diceRollResult } from '../world/DiceMotion';
import { sampleDicePhysics, simulateDiceRoll, type PhysicalDiceRoll } from '../world/DicePhysics';
import './dice-roller.css';

function cosmeticRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
}

/** A visual presentation of an already-authoritative roll; this class never rolls game dice. */
export class DiceRoller {
  private readonly stage = document.createElement('div');
  private readonly caption = document.createElement('div');
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-5, 5, 4, -4, .1, 100);
  private renderer: WebGLRenderer | null = null;
  private model: Group | null = null;
  private loading: Promise<void> | null = null;
  private unavailable = false;
  private dice: Group[] = [];
  private physics: PhysicalDiceRoll | null = null;
  private previewPhysics: { value: number; roll: Promise<PhysicalDiceRoll> } | null = null;
  private frame = 0;
  private safety = 0;
  private version = 0;
  private finish: (() => void) | null = null;
  private observing = false;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly resizeObserver = new ResizeObserver(() => this.resize());

  constructor(parent: HTMLElement) {
    this.stage.className = 'dice-roll-stage'; this.stage.hidden = true;
    this.caption.className = 'dice-roll-caption';
    this.caption.setAttribute('role', 'status'); this.caption.setAttribute('aria-live', 'polite');
    this.stage.append(this.caption); parent.append(this.stage);
    this.camera.position.set(0, 9, 6); this.camera.lookAt(0, .4, 0);
    this.scene.add(new HemisphereLight(0xf6f8ff, 0x9b8b70, 2.8), new AmbientLight(0xffffff, .25));
    const key = new DirectionalLight(0xfff3df, 3.8); key.position.set(-3, 7, 4);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -5;
    key.shadow.camera.right = key.shadow.camera.top = 5;
    key.shadow.camera.near = .1; key.shadow.camera.far = 20;
    key.shadow.normalBias = .015; key.shadow.bias = -.00015;
    const rim = new DirectionalLight(0xd7e8ff, 2); rim.position.set(4, 4, -5);
    this.scene.add(key, rim);
    const floor = new Mesh(new PlaneGeometry(30, 30), new ShadowMaterial({ opacity: .25 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    // requestAnimationFrame pauses in a background tab. A hidden P2P host must
    // still resolve its presentation promise and continue the authoritative turn.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
  }

  /** Begin waiting without displaying a false result, including during GLB loading. */
  startWaiting(): void {
    if (document.hidden) return;
    if (!this.stage.hidden) return;
    this.cancel(); this.open(); this.caption.textContent = '擲骰中…';
    void this.prepare();
    this.safety = window.setTimeout(() => this.cancel(), 10000);
  }

  cancel(): void {
    this.version++; cancelAnimationFrame(this.frame); this.frame = 0;
    clearTimeout(this.safety); this.safety = 0;
    this.stage.hidden = true; this.stage.classList.remove('is-result');
    this.resizeObserver.disconnect(); this.observing = false;
    this.clearDice();
    const resolve = this.finish; this.finish = null; resolve?.();
  }

  roll(values: readonly number[], bonus = 0, multiplier = 1, speed = 1, holdPreview = false): Promise<void> {
    this.cancel(); const token = this.version;
    if (document.hidden || !values.length || values.some(v => !Number.isInteger(v) || v < 1 || v > 6)) return Promise.resolve();
    this.open(); this.caption.textContent = '擲骰中…';
    return new Promise(resolve => {
      this.finish = resolve;
      void this.animate(values, bonus, multiplier, Math.max(.25, speed), token, holdPreview).catch(error => {
        console.warn('Dice presentation interrupted.', error);
        if (token === this.version) this.cancel();
      });
    });
  }

  /** Visible development preview uses the exact same poses and GLB as the game. */
  async previewPose(value: number, progress: number): Promise<void> {
    this.cancel(); const token = this.version; this.open();
    await this.prepare(); if (token !== this.version) return;
    if (!this.previewPhysics || this.previewPhysics.value !== value) {
      let seed = 98765;
      this.previewPhysics = { value, roll: simulateDiceRoll([value], () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000)) };
    }
    const physics = await this.previewPhysics.roll; if (token !== this.version) return;
    this.physics = physics;
    this.setDice([value]); this.resize(); this.draw(progress);
    this.caption.textContent = progress >= 1 ? `頂面 ${value} 點` : `掉落動作 ${Math.round(progress * 100)}%`;
    this.stage.classList.toggle('is-result', progress >= 1);
    this.stage.dataset.phase = String(progress);
  }

  private open(): void {
    this.stage.hidden = false; this.stage.classList.remove('is-result');
    if (!this.observing) { this.resizeObserver.observe(this.stage); this.observing = true; }
    this.resize();
  }

  private async prepare(): Promise<void> {
    if (this.model || this.unavailable) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        this.renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        this.renderer.outputColorSpace = SRGBColorSpace; this.renderer.toneMapping = ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = .95; this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFShadowMap;
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        this.renderer.domElement.addEventListener('webglcontextlost', event => {
          event.preventDefault(); this.unavailable = true; this.renderer!.domElement.hidden = true;
        });
        this.stage.prepend(this.renderer.domElement);
        let timeout = 0;
        const gltf = await Promise.race([
          new GLTFLoader().loadAsync(assetUrl('art/dice/ivory-recessed.glb')),
          new Promise<never>((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Dice asset timeout')), 4500); }),
        ]).finally(() => clearTimeout(timeout));
        const box = new Box3().setFromObject(gltf.scene), size = box.getSize(new Vector3());
        const scale = 1 / Math.max(size.x, size.y, size.z);
        const centered = new Group(); centered.add(gltf.scene);
        gltf.scene.position.sub(box.getCenter(new Vector3())); centered.scale.setScalar(scale);
        gltf.scene.traverse(object => {
          if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; }
        });
        this.model = centered; this.stage.dataset.asset = 'glb'; this.resize();
      } catch (error) {
        console.warn('3D dice unavailable; showing authoritative numeric result.', error);
        this.unavailable = true;
        this.renderer?.dispose(); this.renderer?.domElement.remove(); this.renderer = null;
        this.stage.dataset.asset = 'numeric-fallback';
      }
    })();
    // A slow or missing asset must never block game progression.
    await this.loading;
  }

  private setDice(values: readonly number[]): void {
    this.clearDice();
    if (this.unavailable || !this.model) return;
    this.dice = values.map(() => { const die = this.model!.clone(true); this.scene.add(die); return die; });
  }

  private clearDice(): void { this.dice.forEach(d => this.scene.remove(d)); this.dice = []; }

  private draw(progress: number): void {
    const poses = this.physics ? sampleDicePhysics(this.physics, progress * this.physics.duration) : [];
    this.dice.forEach((die, i) => {
      const pose = poses[i]; if (!pose) return;
      die.position.copy(pose.position); die.quaternion.copy(pose.rotation);
    });
    if (this.renderer && !this.unavailable) this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    if (!this.renderer || this.stage.hidden) return;
    const width = this.stage.clientWidth, height = this.stage.clientHeight;
    if (!width || !height) return;
    // A portrait screen retains enough horizontal room for two dice.
    const bounds = this.physics?.bounds;
    const centerX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
    const centerZ = bounds ? (bounds.minZ + bounds.maxZ) / 2 : 0;
    this.camera.position.set(centerX, 9, centerZ + 6); this.camera.lookAt(centerX, .4, centerZ);
    // Frame the actual simulated travel BEFORE playback. The camera stays fixed;
    // dice are never teleported or constrained to a hand-drawn screen trajectory.
    const halfHeight = Math.max(3.35, (bounds ? (bounds.maxX - bounds.minX + 1.6) / 2 : 2.2) * height / width);
    this.camera.left = -halfHeight * width / height; this.camera.right = -this.camera.left;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight; this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
  }

  private async animate(values: readonly number[], bonus: number, multiplier: number, speed: number, token: number, holdPreview: boolean): Promise<void> {
    await this.prepare(); if (token !== this.version) return;
    if (!this.unavailable) {
      try {
        const physics = await simulateDiceRoll(values, cosmeticRandom);
        if (token !== this.version) return;
        this.physics = physics;
        this.stage.dataset.physics = `Rapier · ${physics.groundContacts} ground / ${physics.dieContacts} dice contacts`;
      } catch (error) {
        console.warn('Dice physics unavailable; showing numeric result.', error);
        this.physics = null;
      }
    } else this.physics = null;
    this.setDice(values); this.resize();
    if (!this.physics) this.clearDice();
    const playbackRate = dicePlaybackRate(speed);
    const duration = this.reducedMotion || !this.physics ? 0 : this.physics.duration * 1000 / playbackRate;
    const hold = Math.max(750, 1050 / playbackRate); const start = performance.now();
    const { total, detail } = diceRollResult(values, bonus, multiplier);
    let resultShown = false;
    const tick = (now: number) => {
      if (token !== this.version) return;
      const elapsed = now - start, progress = duration ? Math.min(1, elapsed / duration) : 1;
      this.draw(progress); this.stage.dataset.phase = progress.toFixed(3);
      if (progress === 1 && !resultShown) {
        resultShown = true; this.stage.classList.add('is-result');
        this.caption.replaceChildren();
        const number = document.createElement('strong'); number.textContent = `${total} 步`;
        const label = document.createElement('small'); label.textContent = detail;
        this.caption.append(number, label);
        if (holdPreview) {
          const resolve = this.finish; this.finish = null; this.frame = 0; resolve?.(); return;
        }
      }
      if (elapsed >= duration + hold) { this.cancel(); return; }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
}
