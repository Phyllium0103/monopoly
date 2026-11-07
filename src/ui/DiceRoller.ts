import {
  ACESFilmicToneMapping, AmbientLight, Box3, DirectionalLight, Group, HemisphereLight, Mesh,
  OrthographicCamera, PCFShadowMap, PlaneGeometry, Scene, ShadowMaterial, SRGBColorSpace,
  Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../data/assetUrl';
import { dicePlaybackRate, diceRollResult } from '../world/DiceMotion';
import { DICE_PHYSICS_STEP, sampleDicePhysics, simulateDiceRoll, withDiceValues, type DiceLaunch, type PhysicalDiceRoll } from '../world/DicePhysics';
import { batchDiceModel } from '../world/DiceModel';
import './dice-roller.css';
import {prepareDiceWorker,simulateDiceInWorker} from '../world/DiceWorker';
import {renderPixelRatio} from '../performance/renderBudget';
import { DICE_PRESENTATION_RATE } from './LordPresentation';

/** Keep the entire die above the viewport before real gravity brings it in. */
export function topDropLaunch(gentle=false,count=1):DiceLaunch{
  const offsets:DiceLaunch['offsets']=count===3?[[-1.25,.28,-.3],[0,0,.35],[1.25,.14,-.3]]:count===2?[[-.8,0,0],[.8,.18,0]]:undefined;
  return {size:1,position:[0,12,0],velocity:[0,-.4,0],surface:gentle?'soft':'standard',...(offsets?{offsets,maxTravel:[6.8,6.8] as const}:{})};
}

/** A visual presentation of an already-authoritative roll; this class never rolls game dice. */
export interface DiceHandOrigin { ndc:readonly [number,number];diameterPx?:number }
export interface DicePresentationOptions { centerFinal?:boolean; gentle?:boolean }

export class DiceRoller {
  private readonly stage = document.createElement('div');
  private readonly caption = document.createElement('div');
  private readonly scene = new Scene();
  private readonly shadowFloor:Mesh;
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
  private handOrigin:DiceHandOrigin|null=null;
  private framingPhysics:PhysicalDiceRoll|null=null;
  private playbackStart = 0;
  private canvasSize = '';
  private releaseFinish:(()=>void)|null=null;
  private plans=new Map<number,Promise<PhysicalDiceRoll|null>>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly resizeObserver = new ResizeObserver(() => this.resize());

  constructor(parent: HTMLElement, private readonly options:DicePresentationOptions={}) {
    this.stage.className = 'dice-roll-stage'; this.stage.hidden = true;
    this.caption.className = 'dice-roll-caption';
    this.caption.setAttribute('role', 'status'); this.caption.setAttribute('aria-live', 'polite');
    this.stage.append(this.caption); (document.body??parent).append(this.stage);
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
    const floor = this.shadowFloor = new Mesh(new PlaneGeometry(30, 30), new ShadowMaterial({ opacity: .25 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    // requestAnimationFrame pauses in a background tab. A hidden P2P host must
    // still resolve its presentation promise and continue the authoritative turn.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
    addEventListener('resize',()=>{if(!this.stage.hidden)this.resize();},{passive:true});
  }

  /** Begin waiting without displaying a false result, including during GLB loading. */
  startWaiting(): void {
    if (document.hidden) return;
    if (!this.stage.hidden) return;
    this.cancel(); this.open(); this.caption.replaceChildren();
    void this.prepare();
    this.safety = window.setTimeout(() => this.cancel(), 10000);
  }

  cancel(): void {
    this.version++; cancelAnimationFrame(this.frame); this.frame = 0;
    clearTimeout(this.safety); this.safety = 0;
    this.stage.hidden = true; this.stage.classList.remove('is-result');
    this.resizeObserver.disconnect(); this.observing = false;
    this.clearDice();this.shadowFloor.visible=true;this.framingPhysics=null;
    const release=this.releaseFinish;this.releaseFinish=null;release?.();
    const resolve = this.finish; this.finish = null; resolve?.();
  }

  roll(values: readonly number[], bonus = 0, multiplier = 1, speed = 1, holdPreview = false, hand?:DiceHandOrigin, prepared?:Promise<PhysicalDiceRoll|null>): Promise<void> {
    this.cancel(); const token = this.version;this.handOrigin=hand??null;
    if (document.hidden || !values.length || values.length > 3 || values.some(v => !Number.isInteger(v) || v < 1 || v > 6)) return Promise.resolve();
    this.open(); this.caption.replaceChildren();
    this.stage.dataset.sequencePhase='preparing';
    return new Promise<void>(resolve => {
      this.finish = resolve;
      void this.animate(values, bonus, multiplier, Math.max(.25, speed), token, holdPreview, prepared).catch(error => {
        console.warn('Dice presentation interrupted.', error);
        if (token === this.version) this.cancel();
      });
    }).then(()=>{if(!this.unavailable)void this.plan(values.length);});
  }

  /** Visible development preview uses the exact same poses and GLB as the game. */
  async previewPose(value: number, progress: number): Promise<void> {
    this.cancel(); const token = this.version; this.open();
    await this.prepare(); if (token !== this.version) return;
    if (!this.previewPhysics || this.previewPhysics.value !== value) {
      let seed = 98765;
      this.previewPhysics = { value, roll: simulateDiceRoll([value], () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000),this.options.centerFinal?topDropLaunch(this.options.gentle):undefined) };
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

  async prepareAssets():Promise<void>{
    await Promise.all([this.prepare(),prepareDiceWorker()]);
    if(this.unavailable)throw new Error('骰子模型尚未準備好');
    this.scene.add(this.model!);await this.renderer!.compileAsync(this.scene,this.camera);this.scene.remove(this.model!);
    await Promise.all([2,3,1].map(count=>this.plan(count)));
  }

  /** Prepare before the character moves, so release never waits for a worker round trip. */
  async prepareRoll(values:readonly number[]):Promise<PhysicalDiceRoll|null>{
    if(document.hidden)return null;
    await this.prepare();if(this.unavailable)return null;
    const pending=this.plan(values.length),physics=await pending;
    if(this.plans.get(values.length)===pending)this.plans.delete(values.length);
    return physics?withDiceValues(physics,values):null;
  }

  private plan(count:number):Promise<PhysicalDiceRoll|null>{
    let pending=this.plans.get(count);if(pending)return pending;
    const seed=crypto.getRandomValues(new Uint32Array(1))[0];
    pending=simulateDiceInWorker(Array(count).fill(1),seed,this.options.centerFinal?topDropLaunch(this.options.gentle,count):undefined)
      .catch(error=>{console.warn('Dice physics unavailable; showing numeric result.',error);return null;});
    this.plans.set(count,pending);return pending;
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
        const batched=batchDiceModel(gltf.scene);
        const box = new Box3().setFromObject(batched), size = box.getSize(new Vector3());
        const scale = 1 / Math.max(size.x, size.y, size.z);
        const centered = new Group(); centered.add(batched);
        batched.position.sub(box.getCenter(new Vector3())); centered.scale.setScalar(scale);
        batched.traverse(object => {
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

  private setDice(values: readonly number[],scale=1,castShadow=true): void {
    this.clearDice();
    if (this.unavailable || !this.model) return;
    this.dice = values.map(() => { const die = this.model!.clone(true); die.scale.multiplyScalar(scale);die.traverse(o=>{if(o instanceof Mesh){o.castShadow=castShadow;o.receiveShadow=castShadow;}});this.scene.add(die); return die; });
  }

  private clearDice(): void { this.dice.forEach(d => this.scene.remove(d)); this.dice = []; }

  private draw(progress: number): void {
    const time = this.playbackStart + progress * (1 - this.playbackStart);
    const poses = this.physics ? sampleDicePhysics(this.physics, time * this.physics.playbackDuration) : [];
    this.dice.forEach((die, i) => {
      const pose = poses[i]; if (!pose) return;
      die.position.copy(pose.position); die.quaternion.copy(pose.rotation);
    });
    if (this.renderer && !this.unavailable) this.renderer.render(this.scene, this.camera);
  }

  /** Small dice fan out of the actual palm, leave the screen, then enter the physical descent. */
  private async playRelease(hand:DiceHandOrigin,speed:number,token:number):Promise<void>{
    const dice=this.dice,physics=this.physics!;
    const targets=sampleDicePhysics(physics,this.playbackStart*physics.playbackDuration);
    const depth=new Vector3(0,.5,0).project(this.camera).z;
    const palm=new Vector3(hand.ndc[0],hand.ndc[1],depth).unproject(this.camera);
    const right=new Vector3().setFromMatrixColumn(this.camera.matrixWorld,0);
    const unitPerPixel=(this.camera.right-this.camera.left)/this.stage.getBoundingClientRect().width;
    const handSize=Math.max(.06,Math.min(.45,(hand.diameterPx??22)*unitPerPixel));
    const starts=dice.map((_,i)=>palm.clone().addScaledVector(right,(i-(dice.length-1)/2)*handSize*.45));
    const scales=dice.map(die=>die.scale.clone());
    const start=performance.now(),duration=360/Math.max(.25,speed);
    this.shadowFloor.visible=false;
    dice.forEach(die=>die.traverse(o=>{if(o instanceof Mesh)o.castShadow=false;}));
    this.stage.dataset.sequencePhase='hand-release';this.stage.dataset.diceCount=String(dice.length);
    try{
      await new Promise<void>(resolve=>{
        this.releaseFinish=resolve;
        const tick=(now:number)=>{
          if(token!==this.version){resolve();return;}
          const t=Math.min(1,Math.max(0,(now-start)/duration)),ease=1-(1-t)**2;
          dice.forEach((die,i)=>{
            die.position.lerpVectors(starts[i],targets[i].position,ease)
              .addScaledVector(right,(i-(dice.length-1)/2)*.35*Math.sin(Math.PI*t));
            die.scale.copy(scales[i]).multiplyScalar(handSize+(1-handSize)*t*t);
            die.quaternion.copy(targets[i].rotation);die.rotateY((1-t)*Math.PI*(i+1));
          });
          this.renderer?.render(this.scene,this.camera);
          if(t===1){this.releaseFinish=null;resolve();}else this.frame=requestAnimationFrame(tick);
        };
        this.frame=requestAnimationFrame(tick);
      });
    }finally{
      dice.forEach((die,i)=>{die.scale.copy(scales[i]);die.traverse(o=>{if(o instanceof Mesh)o.castShadow=true;});});
      this.shadowFloor.visible=true;
    }
  }

  private resize(): void {
    if (!this.renderer || this.stage.hidden) return;
    const rect=this.stage.getBoundingClientRect(),width=rect.width,height=rect.height;
    if (!width || !height) return;
    // A portrait screen retains enough horizontal room for up to three dice.
    const framing=this.framingPhysics??this.physics;
    const bounds = framing?.bounds;
    const resting=this.options.centerFinal&&framing?sampleDicePhysics(framing,framing.playbackDuration):[];
    const centerX = resting.length?resting.reduce((s,p)=>s+p.position.x,0)/resting.length:bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
    const centerZ = resting.length?resting.reduce((s,p)=>s+p.position.z,0)/resting.length:bounds ? (bounds.minZ + bounds.maxZ) / 2 : 0;
    const centerY = resting.length?resting.reduce((s,p)=>s+p.position.y,0)/resting.length:.4;
    // View the settled result face at 60 degrees above horizontal.
    const viewAngle = Math.PI / 3;
    const viewDistance = Math.hypot(7, 12);
    // Align the projected launch and resting centroids vertically. Physics may
    // drift sideways while bouncing; camera framing must account for that drift.
    const launch = resting.length ? framing?.frames[0] : undefined;
    const launchX = launch?.length ? launch.reduce((sum,p)=>sum+p.position.x,0)/launch.length : centerX;
    const launchZ = launch?.length ? launch.reduce((sum,p)=>sum+p.position.z,0)/launch.length : centerZ;
    const horizontal = new Vector3(centerX-launchX,0,centerZ-launchZ);
    if (horizontal.lengthSq() < 1e-8) horizontal.set(0,0,1);
    horizontal.normalize().multiplyScalar(Math.cos(viewAngle)*viewDistance);
    this.camera.position.set(centerX + horizontal.x, centerY + Math.sin(viewAngle) * viewDistance, centerZ + horizontal.z); this.camera.lookAt(centerX, centerY, centerZ);this.camera.updateMatrixWorld();
    // Frame the actual simulated travel BEFORE playback. The camera stays fixed;
    // dice are never teleported or constrained to a hand-drawn screen trajectory.
    const halfHeight = Math.max(3.35, (bounds ? (bounds.maxX - bounds.minX + 1.6) / 2 : 2.2) * height / width);
    this.camera.left = -halfHeight * width / height; this.camera.right = -this.camera.left;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight; this.camera.updateProjectionMatrix();
    // Skip only the invisible part of the descent: begin just above the top edge.
    // Keep the simulated bounce and resting positions intact.
    this.playbackStart = 0;
    if (this.options.centerFinal && framing) {
      const threshold = 1 + (Math.sqrt(3) / 2 + .08) / halfHeight;
      for (let i = 1; i < framing.frames.length; i++) {
        if (framing.frames[i].some(p => p.position.clone().project(this.camera).y <= threshold)) {
          this.playbackStart = Math.min(.9, (i - 1) * DICE_PHYSICS_STEP / framing.playbackDuration);
          break;
        }
      }
    }
    const ratio=renderPixelRatio(width,height,1_600_000),size=[width,height,ratio].join(':');
    if(size!==this.canvasSize){this.canvasSize=size;this.renderer.setPixelRatio(ratio);this.renderer.setSize(width, height,false);}
    this.renderer.render(this.scene, this.camera);
  }

  private async animate(values: readonly number[], bonus: number, multiplier: number, speed: number, token: number, holdPreview: boolean, prepared?:Promise<PhysicalDiceRoll|null>): Promise<void> {
    await this.prepare(); if (token !== this.version) return;
    if (!this.unavailable) {
      try {
        const physics=await (prepared??this.prepareRoll(values));
        if(!physics)throw new Error('Dice physics not ready');
        this.stage.dataset.bounceProfile=this.options.gentle?'soft':'standard';
        this.framingPhysics=physics;
        this.stage.dataset.launchMode=this.handOrigin?'release-to-top-drop':'top-drop';
        this.stage.dataset.handOrigin=JSON.stringify(this.handOrigin?.ndc??null);
        if (token !== this.version) return;
        this.physics = physics;
        this.stage.dataset.physics = `Rapier · ${physics.groundContacts} ground / ${physics.dieContacts} dice contacts`;
      } catch (error) {
        console.warn('Dice physics unavailable; showing numeric result.', error);
        this.physics = null;
      }
    } else this.physics = null;
    if(token!==this.version)return;
    this.shadowFloor.visible=true;this.setDice(values);this.resize();
    if(this.handOrigin&&this.physics&&!this.reducedMotion)await this.playRelease(this.handOrigin,speed,token);
    if(token!==this.version)return;
    this.draw(0);
    this.stage.dataset.sequencePhase='large-descent';this.stage.dataset.dieScale='1';this.stage.dataset.phase='0';this.stage.dataset.shadowMode='contact';
    if (!this.physics) this.clearDice();
    const playbackRate = dicePlaybackRate(speed)*DICE_PRESENTATION_RATE;
    const duration = this.reducedMotion || !this.physics ? 0 : this.physics.playbackDuration * (1 - this.playbackStart) * 1000 / playbackRate;
    const hold = 120; const start = performance.now();
    const { total, detail } = diceRollResult(values, bonus, multiplier);
    let resultShown = false;
    const tick = (now: number) => {
      if (token !== this.version) return;
      const elapsed = Math.max(0,now - start), progress = duration ? Math.min(1, elapsed / duration) : 1;
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
