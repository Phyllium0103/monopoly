import { assetUrl } from '../data/assetUrl';
import { forkDirection } from '../data/mapView';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { City, ElementalSpirit, GameState, Tile, Vec2 } from '../game/types';
import { ElementalSpiritLayer } from './ElementalSpirits';
import { SelectedTerrain } from './SelectedTerrain';
import { MapModelPool } from './MapModelPool';
import { BUILDING_LOTS, CELL_SIZE, cityModelLevel } from '../data/selectedBoard';
import { MAP_MODELS } from '../data/mapModels';
import { DISPLAY_FACILITY_LOTS } from '../data/displayFacilities';
import { animateCity, type CityVisual } from './CityMesh';
import { ownerColor, ownerName } from '../faction/Faction';
import { BOARD, TILE_INFO } from '../data/board';
import type { Animator } from '../scene/Animator';
import { easeOut } from '../scene/Animator';
import { cityToll } from '../systems/CitySystem';
import { fmtStones } from '../game/Currency';



interface CityEntry {
  visual: CityVisual;
  holder: THREE.Group;
  territory: THREE.Mesh;
  label: HTMLDivElement;
  owner: string;
}

export class World {
  root = new THREE.Group();
  terrain: SelectedTerrain;
  private modelPool = new MapModelPool(()=>this.invalidateShadows());
  pickables: THREE.Object3D[] = [];
  tiles: Tile[] = BOARD.tiles;
  private cities = new Map<string, CityEntry>();
  private highlights = new THREE.Group();
  private hover: THREE.Mesh;
  private time = 0;
  private eventMarkers: THREE.Group[] = [];
  private spirits = new ElementalSpiritLayer(index => this.tilePosition(index));
  private facing = new Map<string, THREE.Group>();
  private textureReady:Promise<void>[]=[];
  private roadArrows=Object.fromEntries(['north','east','south','west'].map(d=>{let ok!:()=>void,fail!:(e:unknown)=>void;this.textureReady.push(new Promise<void>((resolve,reject)=>{ok=resolve;fail=reject;}));const t=new THREE.TextureLoader().load(assetUrl(`art/map-runtime/road-arrow-${d}.webp`),()=>ok(),undefined,fail);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return[d,t];}));
  private forkArrows = new Map<number, THREE.Group>();

  constructor(
    scene: THREE.Scene,
    private animator: Animator,
    private invalidateShadows:()=>void,
  ) {
    scene.add(this.root);
    this.root.add(this.spirits.group);
    this.terrain = new SelectedTerrain();
    this.root.add(this.modelPool.group);
    this.root.add(this.terrain.group);
    this.root.add(this.highlights);

    for (const tile of this.tiles) {
      if (tile.kind !== 'city') this.addSpecial(tile);
      this.addPicker(tile);
    }
    for (const lot of DISPLAY_FACILITY_LOTS) this.addDisplayFacility(lot);

    this.hover = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.55, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.hover.rotation.x = -Math.PI / 2;
    this.hover.visible = false;
    this.root.add(this.hover);
  }

  warmup(renderer:THREE.WebGLRenderer){return this.modelPool.warmup(renderer);}
  async prepare(progress:(done:number,total:number)=>void){await Promise.all([this.terrain.ready,...this.textureReady]);await this.modelPool.prepare(progress);}
  updateVisibility(camera:THREE.OrthographicCamera,height:number){this.modelPool.update(camera,height);}
  ground(x: number, z: number) {
    return Math.max(this.terrain.heightAt(x, z), 0);
  }

  syncSpirits(spirits: readonly ElementalSpirit[]) { this.spirits.sync(spirits); }
  animateSpiritAtTile(tile: number) { return this.spirits.playAtTile(tile); }
  clearSpirits() { this.spirits.clear(); }

  tilePosition(index: number): THREE.Vector3 {
    const p = this.tiles[index].pos;
    return new THREE.Vector3(p.x, this.ground(p.x, p.z), p.z);
  }

  private tileRadius(_index: number) { return CELL_SIZE*.38; }

  private addSpecial(tile: Tile) {
    const lot=BUILDING_LOTS.find(o=>o.tile===tile.index);
    if(!lot) return;
    const g=new THREE.Group();g.position.set(lot.pos.x,0,lot.pos.z);this.root.add(g);
    const el=document.createElement('div');el.className=`special-label k-${tile.kind}`;
    el.textContent=`${TILE_INFO[tile.kind].icon} ${tile.name}`;el.dataset.tile=String(tile.index);el.dataset.tiles=lot.triggerTiles.join(',');el.hidden=true;
    const label=new CSS2DObject(el);label.position.set(0,7,0);g.add(label);
  }

  private addPicker(tile: Tile) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE*.96,1,CELL_SIZE*.96),new THREE.MeshBasicMaterial({visible:false}));
    mesh.position.copy(this.tilePosition(tile.index));mesh.userData={pick:true,tile:tile.index};
    this.root.add(mesh);this.pickables.push(mesh);
    const lot=BUILDING_LOTS.find(o=>o.tile===tile.index);
    if(lot){const box=new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE*2,5,CELL_SIZE*2),new THREE.MeshBasicMaterial({visible:false}));
      box.position.set(lot.pos.x,2.5,lot.pos.z);box.userData={pick:true,tile:tile.index};this.root.add(box);this.pickables.push(box);}
  }

  /** 純展示建築的選取面只用來顯示名稱，不對應任何遊戲事件格。 */
  private addDisplayFacility(lot: (typeof DISPLAY_FACILITY_LOTS)[number]) {
    const g=new THREE.Group();g.position.set(lot.pos.x,0,lot.pos.z);this.root.add(g);
    const el=document.createElement('div');el.className='special-label display-facility-label';
    el.textContent=lot.name;el.dataset.facility=lot.id;el.hidden=true;
    const label=new CSS2DObject(el);label.position.set(0,12,0);g.add(label);
    const box=new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE*2,5,CELL_SIZE*2),new THREE.MeshBasicMaterial({visible:false}));
    box.position.set(lot.pos.x,2.5,lot.pos.z);box.userData={pick:true,displayFacility:lot.id};
    this.root.add(box);this.pickables.push(box);
  }

  setOccupied(indices:number[]) {
    this.terrain.setOccupied(indices);
    for(const [i,g] of this.forkArrows){const plate=g.userData.plate as THREE.Mesh;if(plate)(plate.material as THREE.MeshPhongMaterial).color.setHex(indices.includes(i)?0xa7e8e8:0xffffff);}
  }

  /** 依遊戲狀態建立或更新所有城池 */
  syncCities(state: GameState) {
    for (const city of Object.values(state.cities)) {
      const entry = this.cities.get(city.id);
      if (!entry) this.createCity(city);
      else if (entry.owner !== city.owner) this.rebuildCity(city);
      this.updateLabel(state, city);
    }
    const placements=BUILDING_LOTS.flatMap(o=>{
      const city=o.type==='city'?state.cities[o.id]:null;
      const key=(city?`city-${cityModelLevel(city.prosperity)}`:o.type) as keyof typeof MAP_MODELS;
      if(!(key in MAP_MODELS))return [];
      return [{id:o.id,key,x:o.pos.x,z:o.pos.z,rotation:o.rotation,color:city&&city.owner!=='neutral'?ownerColor(city.owner):0xffffff}];
    });
    const displayPlacements=DISPLAY_FACILITY_LOTS.map(o=>({id:o.id,key:o.type,x:o.pos.x,z:o.pos.z,rotation:o.rotation,color:0xffffff}));
    return this.modelPool.sync([...placements,...displayPlacements],this.tiles[state.lords[state.order[state.turn]]?.position??-1]?.pos);
  }

  private createCity(city: City) {
    const lot=BUILDING_LOTS.find(o=>o.id===city.id)!;
    const pos=new THREE.Vector3(lot.pos.x,0,lot.pos.z);
    const holder = new THREE.Group();
    holder.position.copy(pos);
    this.root.add(holder);

    const territory = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL_SIZE*2.08,CELL_SIZE*2.08),
      new THREE.MeshBasicMaterial({ color: ownerColor(city.owner), transparent: true, opacity: 0.28, depthWrite: false }),
    );
    territory.rotation.x = -Math.PI / 2;
    territory.position.set(pos.x, 0.04, pos.z);
    territory.renderOrder = 1;
    territory.visible = city.owner !== 'neutral';
    this.root.add(territory);

    const label = document.createElement('div');
    label.className = `city-label${city.capital || city.prosperity>=80 ? ' map-landmark':''}`;
    const labelObj = new CSS2DObject(label);
    labelObj.position.set(0, 8, 0);
    holder.add(labelObj);

    const visual:CityVisual = {group:new THREE.Group(),animated:[],flags:[]};
    holder.add(visual.group);
    this.cities.set(city.id, { visual, holder, territory, label, owner: city.owner });
  }

  private rebuildCity(city: City) {
    const e = this.cities.get(city.id)!;
    e.owner = city.owner;
    (e.territory.material as THREE.MeshBasicMaterial).color.setHex(ownerColor(city.owner));
    e.territory.visible = city.owner !== 'neutral';
  }

  private updateLabel(state: GameState, city: City) {
    const e = this.cities.get(city.id)!;
    const tollText = city.owner === 'neutral' ? '' : `<small class="toll">💰${fmtStones(cityToll(state, city), true)}</small>`;
    const html = `${city.capital ? '★' : ''}${city.name}<small>${ownerName(city.owner)}</small>${tollText}`;
    if(e.label.innerHTML!==html)e.label.innerHTML=html;
  }

  setHover(index: number | null, displayFacility: string | null = null) {
    if(index!==null&&this.tiles[index].kind==='road')index=null;
    for(const el of this.root.children.flatMap(g=>g.children).filter(o=>o instanceof CSS2DObject)) {
      const element=(el as CSS2DObject).element;
      if(element.classList.contains('special-label'))element.hidden=element.dataset.facility
        ? element.dataset.facility!==displayFacility
        : !element.dataset.tiles?.split(',').includes(String(index));
    }
    if (index === null) {
      this.hover.visible = false;
      return;
    }
    const p = this.tilePosition(index);
    this.hover.scale.setScalar(this.tileRadius(index) / 1.3);
    this.hover.position.set(p.x, p.y + 0.35, p.z);
    this.hover.visible = true;
  }

  /** 標示格子（傳送陣選位置、移動路徑） */
  showHighlights(indices: number[], color = 0xffe066) {
    this.clearHighlights();
    const geo = new THREE.RingGeometry(0.9, 1.2, 32);
    for (const i of indices) {
      const p = this.tilePosition(i);
      const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      const s = this.tileRadius(i) / 1.1;
      ring.scale.setScalar(s);
      ring.userData.baseScale = s;
      ring.position.set(p.x, p.y + 0.4, p.z);
      this.highlights.add(ring);
    }
  }

  clearHighlights() {
    for (const c of [...this.highlights.children]) {
      this.highlights.remove(c);
      const mesh=c as THREE.Mesh;mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();
    }
  }

  /** 佔領特效：光環擴散 + 金色粒子 */
  captureEffect(tile: number, color: number) {
    const p = this.tilePosition(tile);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.2, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, p.y + 0.3, p.z);
    this.root.add(ring);

    const count = 70;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      pos.set([p.x, p.y + 0.5, p.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.5;
      vel.push(new THREE.Vector3(Math.cos(a) * s, 3 + Math.random() * 5, Math.sin(a) * s));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd860, size: 0.35, transparent: true, depthWrite: false }));
    this.root.add(pts);
    let last = 0;
    this.animator
      .tween(1.5, (t) => {
        const dt = (t - last) * 1.5;
        last = t;
        ring.scale.setScalar(1 + easeOut(t) * 5);
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - t;
        const arr = geo.attributes.position.array as Float32Array;
        for (let i = 0; i < count; i++) {
          vel[i].y -= 9 * dt;
          arr[i * 3] += vel[i].x * dt;
          arr[i * 3 + 1] += vel[i].y * dt;
          arr[i * 3 + 2] += vel[i].z * dt;
        }
        geo.attributes.position.needsUpdate = true;
        (pts.material as THREE.PointsMaterial).opacity = 1 - t * t;
      })
      .then(() => {
        this.root.remove(ring, pts);
        geo.dispose();ring.geometry.dispose();(ring.material as THREE.Material).dispose();(pts.material as THREE.Material).dispose();
      });
  }

  /** 光柱特效（突破、傳送） */
  beamEffect(pos: THREE.Vector3, color = 0xfff3b0) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 1, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beam.position.set(pos.x, pos.y + 7, pos.z);
    this.root.add(beam);
    this.animator
      .tween(1.4, (t) => {
        beam.scale.set(1 - t * 0.7, 1, 1 - t * 0.7);
        (beam.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
      })
      .then(() => {this.root.remove(beam);beam.geometry.dispose();(beam.material as THREE.Material).dispose();});
  }

  /** Same physical road slab, four authored jade-arrow textures. */
  private makeSignpost(): THREE.Group {
    const group=new THREE.Group();
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE*.89,CELL_SIZE*.89).rotateX(-Math.PI/2),new THREE.MeshPhongMaterial({map:this.roadArrows.north,color:0xffffff,shininess:18}));
    plate.position.y=.025;plate.name='sign';group.add(plate);group.userData.plate=plate;
    return group;
  }

  /** forkDirections 可另外指定（多人播放動畫時，顯示棋子尚未走到的岔路的舊方向） */
  syncForkArrows(state: GameState, forkDirections = state.forkDirections) {
    for (const tile of this.tiles) {
      if (tile.links.length < 3) continue;
      const target = this.tiles[forkDirections[tile.index]];
      const len = Math.hypot(target.pos.x - tile.pos.x, target.pos.z - tile.pos.z) || 1;
      const dx = (target.pos.x - tile.pos.x) / len;
      const dz = (target.pos.z - tile.pos.z) / len;
      let sign = this.forkArrows.get(tile.index);
      if (!sign) {
        sign = this.makeSignpost();
        this.root.add(sign);
        this.forkArrows.set(tile.index, sign);
      }
      // 立在通往目標的路上，離城池或路口一小段距離，才不會被建築蓋住
      const off = 0;
      const p = this.tilePosition(tile.index);
      sign.position.set(p.x + dx * off, p.y, p.z + dz * off);
      const plate=sign.userData.plate as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshPhongMaterial>;
      plate.material.map=this.roadArrows[forkDirection(dx,dz)];
      sign.userData.direction=forkDirection(dx,dz);
    }
  }

  /** 主公面向的箭頭：dir 為 null 時（尚未出發）不顯示 */
  setFacing(id: string, color: number, tile: number, dir: Vec2 | null, slot: number) {
    let g = this.facing.get(id);
    if (!g) {
      g = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 14).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
      cone.renderOrder = 5;
      g.add(cone);
      this.root.add(g);
      this.facing.set(id, g);
    }
    if (!dir) {
      g.visible = false;
      return;
    }
    const p = this.tilePosition(tile);
    const len = Math.hypot(dir.x, dir.z) || 1;
    const dx = dir.x / len;
    const dz = dir.z / len;
    // 各主公的箭頭略微錯開，避免重疊
    const side = (slot - 1.5) * 0.28;
    g.position.set(p.x + dx * 1.3 - dz * side, p.y + 0.9, p.z + dz * 1.3 + dx * side);
    g.rotation.y = Math.atan2(dx, dz);
    g.visible = true;
  }

  /** 九州風雲的地圖標記：旅行商人、黃巾賊窩 */
  private eventMarkerKey='';
  setEventMarkers(merchantTile: number | null, banditTiles: number[]) {
    const key=JSON.stringify([merchantTile,banditTiles]);if(key===this.eventMarkerKey)return;this.eventMarkerKey=key;
    for (const m of this.eventMarkers) {
      m.removeFromParent();
      m.traverse((o) => {
        if (o instanceof CSS2DObject) o.element.remove();
        if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of [o.material].flat())m.dispose();}
      });
    }
    this.eventMarkers = [];
    const add = (tile: number, color: number, text: string, cls: string) => {
      const g = new THREE.Group();
      const p = this.tilePosition(tile);
      g.position.set(p.x, p.y, p.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x4a3020 }));
      pole.position.set(0.9, 1.3, -0.6);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.3 }));
      flag.position.set(1.4, 2.3, -0.6);
      flag.userData.wave = true;
      g.add(pole, flag);
      const el = document.createElement('div');
      el.className = `event-marker ${cls}`;
      el.textContent = text;
      const label = new CSS2DObject(el);
      label.position.set(0.9, 3, -0.6);
      g.add(label);
      this.root.add(g);
      this.eventMarkers.push(g);
    };
    if (merchantTile !== null) add(merchantTile, 0xe8b84a, '🐫 旅行商人', 'merchant');
    for (const t of banditTiles) add(t, 0xd8c040, '🏴 賊窩', 'bandit');
  }

  update(dt: number) {
    this.spirits.update();
    this.time += dt;
    for (const m of this.eventMarkers) {
      const flag = m.children.find((c) => c.userData.wave);
      if (flag) flag.rotation.y = Math.sin(this.time * 3) * 0.4;
    }
    const t = this.time;
    for (const e of this.cities.values()) animateCity(e.visual, t);
    for (const h of this.highlights.children) {
      if (h.userData.baseScale) h.scale.setScalar(h.userData.baseScale * (1 + Math.sin(t * 5) * 0.08));
    }
    this.terrain.update(t);
  }
}
