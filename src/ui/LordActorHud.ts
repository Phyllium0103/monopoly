import { LinearFilter, OrthographicCamera, Scene, Sprite, SpriteMaterial, SRGBColorSpace, Texture, TextureLoader, WebGLRenderer } from 'three';
import type { GameState, LordId } from '../game/types';
import { LORDS, LORD_IDS } from '../faction/Faction';
import { assetUrl } from '../data/assetUrl';
import { citiesOf, generalsOf } from '../game/GameState';
import { fmtStones } from '../game/Currency';
import { LORD_PRESENTATION_RATE } from './LordPresentation';
import { spriteSourceToWorld, type SpritePose } from './LordSpriteRig';
import './lord-actor-hud.css';
import { type DiceHandOrigin } from './DiceRoller';

type Clip='prep'|'throw'|'recovery';
interface Pose extends SpritePose {sheet:number;externalSheet?:string}
interface Atlas {release?:{frame:number;point:[number,number];time?:number;paintedCubeWidth?:number};width:number;height:number;pixelsPerUnit:number;duration:number;times:number[];sheets:string[];frames:Pose[]}
interface Actor {
  id:LordId;card:HTMLElement;seat:HTMLElement;values:HTMLElement[];
  sprite:Sprite|null;atlases:Partial<Record<Clip,Atlas>>;textures:Map<string,Texture>;pending:Map<string,Promise<Texture>>;
  clip:Clip;frame:number;
}
interface Motion {actor:Actor;clip:Clip;elapsed:number;end:number;resolve:()=>void}
const FIELDS=[['stones','靈石'],['soldiers','士兵'],['cities','城池'],['generals','武將']] as const;
const PORTRAITS:Record<LordId,string>={liu:'liubei',cao:'caocao',sun:'sunquan',dong:'dongzhuo'};
const sheet=(a:Atlas,p:Pose)=>p.externalSheet??a.sheets[p.sheet];
const path=(id:LordId,file:string)=>assetUrl(`art/lord-hud/${id}/${file}`);

/** Cosmetic-only HUD. Authoritative turns, dice and rewards remain in Engine. */
export class LordActorHud {
  readonly viewport=document.createElement('div');
  private readonly dock=document.createElement('div');
  private readonly actors=new Map<LordId,Actor>();
  private readonly scene=new Scene();
  private readonly camera=new OrthographicCamera(0,1,1,0,.1,100);
  private renderer:WebGLRenderer|null=null;
  private initialization:Promise<void>|null=null;
  private visible=false;
  private available=true;
  private active:LordId|null=null;
  private awaitingMovement:LordId|null=null;
  private stateKey='';
  private turnVersion=0;
  private presentationVersion=0;
  private preparing:Promise<void>=Promise.resolve();
  private rolling:LordId|null=null;
  private motion:Motion|null=null;
  private frameHandle=0;
  private previousTime=0;
  private unblockWait:(()=>void)|null=null;

  constructor(private readonly parent:HTMLElement,private readonly speed:()=>number,onLord:(id:LordId)=>void){
    parent.classList.add('lord-actors-enabled');
    this.viewport.dataset.base='03';this.viewport.dataset.animationRate=String(LORD_PRESENTATION_RATE);
    try{localStorage.removeItem('lord-hud-style');}catch{}
    this.viewport.className='lord-actors-viewport';this.viewport.setAttribute('aria-label','主公人物');
    this.dock.className='lord-actors-dock';this.viewport.append(this.dock);parent.append(this.viewport);
    for(const id of LORD_IDS){
      const card=document.createElement('article');card.className='lord-actor';card.dataset.lord=id;
      card.style.setProperty('--fc',LORDS[id].css);
      const button=document.createElement('button');button.type='button';button.className='lord-actor-hit';
      button.setAttribute('aria-label',`${LORDS[id].name}，查看詳細資料`);
      button.onclick=()=>onLord(id);
      const island=document.createElement('span');island.className='lord-island-artwork';
      const image=document.createElement('img');image.className='lord-island-image';image.src=assetUrl('art/lord-base-images-r5/03-tall.webp');image.alt='';island.append(image);
      const inscriptions=document.createElement('span');inscriptions.className='lord-island-values';
      const values:HTMLElement[]=[];
      for(const [name,label] of FIELDS){
        const row=document.createElement('span');row.className='lord-island-value';
        const icon=document.createElement('img');icon.src=assetUrl(`art/lord-island-hud/${name}.svg`);icon.alt=label;
        const value=document.createElement('b');row.append(icon,value);inscriptions.append(row);values.push(value);
      }
      island.append(inscriptions);button.append(island);
      const seat=document.createElement('i');seat.className='lord-actor-seat';seat.setAttribute('aria-hidden','true');
      const fallback=document.createElement('img');fallback.className='lord-actor-fallback';fallback.alt=LORDS[id].name;
      fallback.src=assetUrl(`art/generals/head/${PORTRAITS[id]}.webp`);
      card.append(button,seat,fallback);this.dock.append(card);
      this.actors.set(id,{id,card,seat,values,sprite:null,atlases:{},textures:new Map(),pending:new Map(),clip:'prep',frame:-1});
    }
    this.camera.position.set(0,0,10);this.camera.lookAt(0,0,0);
    addEventListener('resize',()=>this.layout());
    this.viewport.addEventListener('scroll',()=>this.layoutActors());
    const resize=new ResizeObserver(()=>this.layout());
    for(const selector of ['.top-bar','.bottom-panel','.party-dock'])resize.observe(parent.querySelector(selector)??parent);
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){this.cancel();cancelAnimationFrame(this.frameHandle);this.frameHandle=0;}
      else if(this.visible)this.startFrames();
    });
  }

  show(show:boolean):void{
    this.visible=show;this.viewport.hidden=!show;
    if(this.renderer)this.renderer.domElement.hidden=!show;
    if(show){this.layout();this.startFrames();}
    else{this.cancel();cancelAnimationFrame(this.frameHandle);this.frameHandle=0;}
  }

  update(state:GameState,me:LordId):void{
    const displayOrder=[...state.order.filter(id=>id!==me),me];
    const order=displayOrder.join(',');
    if(this.dock.dataset.order!==order){for(const id of displayOrder)this.dock.append(this.actors.get(id)!.card);this.dock.dataset.order=order;}
    for(const [id,a] of this.actors){
      const lord=state.lords[id],present=!lord.absent;
      a.card.hidden=!present;a.card.classList.toggle('is-out',!lord.alive);
      if(a.sprite){a.sprite.visible=present;a.sprite.material.opacity=lord.alive?1:.45;}
      const values=[fmtStones(lord.stones,true),lord.soldiers.toLocaleString(),String(citiesOf(state,id).length),String(generalsOf(state,id).length)];
      values.forEach((value,i)=>{a.values[i].textContent=value;a.values[i].title=i===0?fmtStones(lord.stones):value;});

    }
    const key=`${state.round}:${state.turn}:${state.over}`;
    if(key!==this.stateKey){
      this.stateKey=key;
      const id=state.order[state.turn];
      if(state.over){this.active=null;this.cancel();this.markCurrent();}
      else if(!this.rolling)this.focus(id);
    }
    this.layout();
  }

  /** Explicit lord survives online state snapshots that are already one turn ahead. */
  focus(id:LordId):void{
    if(this.rolling||!this.visible)return;
    this.awaitingMovement=null;this.active=id;this.markCurrent();
    const version=++this.turnVersion;
    this.stopMotion();this.idleAll();
    this.preparing=(async()=>{
      await this.initialize();
      const a=this.actors.get(id)!;
      if(!this.available||version!==this.turnVersion||!this.visible||document.hidden)return;
      await Promise.all([this.preload(a,'prep'),this.preload(a,'throw'),id==='liu'?Promise.resolve():this.preload(a,'recovery')]);
      if(version!==this.turnVersion||!this.visible||document.hidden)return;
      await this.playClip(a,'prep',0,a.atlases.prep!.duration);
      if(version===this.turnVersion)a.card.dataset.pose='ready';
    })().catch(error=>{console.warn('Lord HUD animation unavailable.',error);this.actors.get(id)!.card.classList.add('actor-unavailable');});
  }

  async playRoll(id:LordId,drop:(origin?:DiceHandOrigin)=>Promise<void>):Promise<void>{
    if(document.hidden||!this.visible){await drop();return;}
    if(this.rolling)this.cancel();
    if(this.active!==id)this.focus(id);
    const version=++this.presentationVersion;this.rolling=id;
    const a=this.actors.get(id)!;
    let completed=false;
    try{
      // Missing decorative assets never prevent an authoritative move.
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{await Promise.race([this.preparing,new Promise<void>(resolve=>{timer=setTimeout(resolve,5000);}),new Promise<void>(resolve=>{this.unblockWait=resolve;})]);}
      finally{clearTimeout(timer);this.unblockWait=null;}
      if(version!==this.presentationVersion)return;
      if(!this.available||!a.atlases.throw||!a.textures.has(sheet(a.atlases.throw,a.atlases.throw.frames[0]))){await drop();return;}
      const release=a.atlases.throw.release,at=release?.time??.54;
      await this.playClip(a,'throw',0,at);
      if(version!==this.presentationVersion)return;
      let origin:DiceHandOrigin|undefined;
      if(release&&a.sprite){
        this.setFrame(a,'throw',release.frame);
        const p=spriteSourceToWorld(a.sprite,this.camera,a.atlases.throw.frames[release.frame],release.point).project(this.camera);
        origin={ndc:[p.x,p.y],diameterPx:(release.paintedCubeWidth??142)*Number(a.card.dataset.sourcePixelScale??.14)};
      }
      await Promise.all([this.playClip(a,'throw',at,a.atlases.throw.duration),drop(origin)]);
      if(version!==this.presentationVersion)return;
      this.awaitingMovement=id;completed=true;this.faceForward(a);a.card.dataset.pose='awaiting-movement';
    }finally{
      if(version===this.presentationVersion){this.stopMotion();this.rolling=null;if(!completed){this.idleAll();a.card.dataset.pose='meditating';}}
    }
  }

  /** Called only after the complete route has finished, including relic routes and zero-step turns. */
  async movementDone(id:LordId):Promise<void>{
    if(this.awaitingMovement!==id)return;
    this.awaitingMovement=null;const a=this.actors.get(id)!,version=this.presentationVersion;
    this.faceForward(a);
    if(a.atlases.recovery)await this.playClip(a,'recovery',0,a.atlases.recovery.duration);
    if(version===this.presentationVersion){this.setFrame(a,'prep',0);a.card.dataset.pose='meditating';}
  }
  private faceForward(a:Actor):void{a.card.dataset.gaze='forward';}

  cancel():void{
    this.presentationVersion++;this.turnVersion++;this.rolling=null;this.awaitingMovement=null;this.unblockWait?.();this.unblockWait=null;this.stopMotion();this.idleAll();
  }

  reset():void{this.cancel();this.stateKey='';this.active=null;this.markCurrent();}

  private markCurrent():void{
    this.viewport.dataset.current=this.active??'';
    for(const [id,a] of this.actors)a.card.classList.toggle('is-current',id===this.active&&!a.card.classList.contains('is-out'));
  }
  private async atlas(a:Actor,clip:Clip):Promise<Atlas>{
    if(!a.atlases[clip]){const r=await fetch(path(a.id,clip+'-16.json'));if(!r.ok)throw new Error('Missing lord atlas');a.atlases[clip]=await r.json() as Atlas;}
    return a.atlases[clip]!;
  }
  private texture(a:Actor,file:string):Promise<Texture>{
    const done=a.textures.get(file);if(done)return Promise.resolve(done);
    let pending=a.pending.get(file);
    if(!pending){pending=new TextureLoader().loadAsync(path(a.id,file)).then(t=>{
      t.colorSpace=SRGBColorSpace;t.minFilter=t.magFilter=LinearFilter;t.generateMipmaps=false;
      a.textures.set(file,t);a.pending.delete(file);return t;
    }).catch(e=>{a.pending.delete(file);throw e;});a.pending.set(file,pending);}
    return pending;
  }
  private async preload(a:Actor,clip:Clip):Promise<void>{const at=await this.atlas(a,clip);await Promise.all([...new Set(at.frames.map(p=>sheet(at,p)))].map(f=>this.texture(a,f)));}
  private initialize():Promise<void>{
    if(this.initialization)return this.initialization;
    this.initialization=(async()=>{
      try{
        this.renderer=new WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
        this.renderer.setClearColor(0,0);this.renderer.outputColorSpace=SRGBColorSpace;
        this.renderer.domElement.className='lord-actors-canvas';this.renderer.domElement.setAttribute('aria-hidden','true');this.parent.append(this.renderer.domElement);
        this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.available=false;this.cancel();for(const a of this.actors.values())a.card.classList.add('actor-unavailable');});
        for(const a of this.actors.values()){
          const material=new SpriteMaterial({transparent:true,alphaTest:.08,depthTest:false,depthWrite:false,toneMapped:false});
          a.sprite=new Sprite(material);a.sprite.visible=false;this.scene.add(a.sprite);
        }
        await Promise.all([...this.actors.values()].map(async a=>{const at=await this.atlas(a,'prep');await this.texture(a,sheet(at,at.frames[0]));this.setFrame(a,'prep',0);}));
        this.layout();for(const a of this.actors.values())a.sprite!.visible=!a.card.hidden;
        this.viewport.dataset.actorsReady='true';this.startFrames();
      }catch(e){this.available=false;for(const a of this.actors.values())a.card.classList.add('actor-unavailable');console.warn('Lord HUD uses portrait fallback.',e);}
    })();return this.initialization;
  }
  private setFrame(a:Actor,clip:Clip,index:number):void{
    const atlas=a.atlases[clip];if(!atlas||!a.sprite)return;
    const i=Math.min(atlas.frames.length-1,Math.max(0,index)),p=atlas.frames[i],t=a.textures.get(sheet(atlas,p));if(!t)return;
    const [l,top,r,b]=p.rect;t.repeat.set((r-l)/atlas.width,(b-top)/atlas.height);t.offset.set(l/atlas.width,1-b/atlas.height);
    if(a.sprite.material.map!==t){a.sprite.material.map=t;a.sprite.material.needsUpdate=true;}
    a.clip=clip;a.frame=i;
    a.card.dataset.clip=clip;a.card.dataset.frame=String(i);a.card.dataset.eyesOpen=String(!p.eyesClosed);
    this.position(a);
  }
  private idleAll():void{
    for(const a of this.actors.values()){
      this.setFrame(a,'prep',0);a.card.dataset.gaze='idle';
      if(a.id!==this.active&&a.atlases.prep){const keep=sheet(a.atlases.prep,a.atlases.prep.frames[0]);for(const [file,t] of a.textures)if(file!==keep){t.dispose();a.textures.delete(file);}}
    }
  }
  private position(a:Actor):void{
    if(!a.sprite||a.frame<0||a.card.hidden)return;
    const at=a.atlases[a.clip]!,p=at.frames[a.frame],[l,t,r,b]=p.rect;
    const unit=a.card.getBoundingClientRect().width*.2622/at.pixelsPerUnit;
    a.sprite.scale.set((r-l)*unit,(b-t)*unit,1);a.sprite.center.set((p.anchor[0]-l)/(r-l),(b-p.anchor[1])/(b-t));
    const seat=a.seat.getBoundingClientRect();a.sprite.position.set(seat.left,innerHeight-seat.top,0);
    a.card.dataset.sourcePixelScale=String(unit);
  }
  private layoutActors():void{for(const a of this.actors.values())this.position(a);}
  private layout():void{
    const count=[...this.actors.values()].filter(a=>!a.card.hidden).length||4;
    const maxHeight=Math.max(108,(innerHeight-280)/2.1);
    const width=Math.min(200,maxHeight,innerWidth<760?176:(innerWidth-210-count*7)/count);
    this.parent.style.setProperty('--lord-actor-width',Math.max(176,width)+'px');
    const toolbar=this.parent.querySelector('.top-bar')?.getBoundingClientRect().height??58;
    const party=this.parent.querySelector<HTMLElement>('.party-dock');
    const partyHeight=party&&!party.classList.contains('hidden')?party.getBoundingClientRect().height:0;
    const rollBottom=Math.max(150,partyHeight+36),rollSize=innerHeight<=700?100:120;
    this.parent.style.setProperty('--lord-actors-bottom','12px');
    this.parent.style.setProperty('--lord-content-top',(toolbar+12)+'px');
    this.parent.style.setProperty('--lord-roll-bottom',rollBottom+'px');
    this.parent.style.setProperty('--lord-info-max-height',Math.max(140,innerHeight-toolbar-12-rollBottom-rollSize-24)+'px');
    this.parent.style.setProperty('--lord-actors-width',String(Math.min(innerWidth-184,count*(Math.max(176,width)+7)+16))+'px');
    this.camera.left=0;this.camera.right=innerWidth;this.camera.bottom=0;this.camera.top=innerHeight;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
    if(this.renderer){this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.setSize(innerWidth,innerHeight);}
    this.layoutActors();
  }
  private stopMotion():void{const motion=this.motion;this.motion=null;motion?.resolve();}
  private playClip(actor:Actor,clip:Clip,start:number,end:number):Promise<void>{
    this.stopMotion();if(document.hidden||!this.visible)return Promise.resolve();
    actor.card.dataset.pose=clip;this.startFrames();
    return new Promise(resolve=>{this.motion={actor,clip,elapsed:start,end,resolve};this.sample(actor,clip,start);});
  }
  private sample(a:Actor,clip:Clip,t:number):void{const at=a.atlases[clip]!;let index=0;at.times.forEach((v,i)=>{if(v<=t)index=i;});if(a.clip!==clip||a.frame!==index)this.setFrame(a,clip,index);}
  private startFrames():void{
    if(this.frameHandle||!this.visible||document.hidden)return;
    this.previousTime=performance.now();this.frameHandle=requestAnimationFrame(this.tick);
  }
  private tick=(now:number):void=>{
    this.frameHandle=0;if(!this.visible||document.hidden)return;
    const dt=Math.min(.1,Math.max(0,(now-this.previousTime)/1000));this.previousTime=now;
    const m=this.motion;if(m){m.elapsed+=dt*Math.max(.25,this.speed())*LORD_PRESENTATION_RATE*(m.clip==='throw'?1.5:1);this.sample(m.actor,m.clip,Math.min(m.elapsed,m.end));if(m.elapsed>=m.end){this.motion=null;m.resolve();}}
    this.renderer?.render(this.scene,this.camera);this.frameHandle=requestAnimationFrame(this.tick);
  };
}
