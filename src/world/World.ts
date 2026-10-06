import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { City, GameState, Tile, Vec2 } from '../game/types';
import { Terrain } from './Terrain';
import { animateCity, buildCityMesh, type CityVisual } from './CityMesh';
import { animateBuilding, buildSpecial, type BuildingVisual } from './Buildings';
import { ownerColor, ownerCss, ownerName } from '../faction/Faction';
import { BOARD, MAP_SCALE, TILE_INFO } from '../data/board';
import type { Animator } from '../scene/Animator';
import { easeOut } from '../scene/Animator';
import { cityToll } from '../systems/CitySystem';
import { fmtStones } from '../game/Currency';

const CITY_SCALE = 0.72;

interface CityEntry {
  visual: CityVisual;
  holder: THREE.Group;
  territory: THREE.Mesh;
  label: HTMLDivElement;
  owner: string;
}

export class World {
  root = new THREE.Group();
  terrain: Terrain;
  pickables: THREE.Object3D[] = [];
  tiles: Tile[] = BOARD.tiles;
  private cities = new Map<string, CityEntry>();
  private buildings: BuildingVisual[] = [];
  private highlights = new THREE.Group();
  private hover: THREE.Mesh;
  private time = 0;
  private eventMarkers: THREE.Group[] = [];
  private facing = new Map<string, THREE.Group>();
  private forkArrows = new Map<number, THREE.Group>();

  constructor(
    scene: THREE.Scene,
    private animator: Animator,
  ) {
    scene.add(this.root);
    const pts: Vec2[] = this.tiles.map((t) => t.pos);
    const segs: [Vec2, Vec2][] = BOARD.edges.map(([a, b]) => [this.tiles[a].pos, this.tiles[b].pos]);
    this.terrain = new Terrain(pts, segs);
    this.root.add(this.terrain.group);
    this.root.add(this.highlights);

    for (const tile of this.tiles) {
      if (tile.kind !== 'city') this.addSpecial(tile);
      this.addPicker(tile);
    }

    this.hover = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.55, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.hover.rotation.x = -Math.PI / 2;
    this.hover.visible = false;
    this.root.add(this.hover);
  }

  ground(x: number, z: number) {
    return Math.max(this.terrain.heightAt(x / MAP_SCALE, z / MAP_SCALE), 0);
  }

  tilePosition(index: number): THREE.Vector3 {
    const p = this.tiles[index].pos;
    return new THREE.Vector3(p.x, this.ground(p.x, p.z), p.z);
  }

  private tileRadius(index: number) {
    const k = this.tiles[index].kind;
    return k === 'city' ? 2.4 : k === 'road' ? 0.9 : 1.8;
  }

  private addSpecial(tile: Tile) {
    const v = buildSpecial(tile.kind);
    const p = this.tilePosition(tile.index);
    v.group.position.copy(p);
    if (tile.kind !== 'road') v.group.scale.setScalar(0.85);
    this.root.add(v.group);
    this.buildings.push(v);
    const el = document.createElement('div');
    el.className = `special-label k-${tile.kind}${tile.links.length >= 3 ? ' fork' : ''}`;
    el.textContent = tile.kind === 'road' ? (tile.links.length >= 3 ? `🔱 ${tile.name}` : tile.name) : `${TILE_INFO[tile.kind].icon} ${tile.name}`;
    const label = new CSS2DObject(el);
    label.position.set(0, tile.kind === 'road' ? 1.6 : 3.6, 0);
    v.group.add(label);
  }

  private addPicker(tile: Tile) {
    const r = this.tileRadius(tile.index) + 0.4;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3, 8), new THREE.MeshBasicMaterial({ visible: false }));
    mesh.position.copy(this.tilePosition(tile.index)).setY(1.2);
    mesh.userData = { pick: true, tile: tile.index };
    this.root.add(mesh);
    this.pickables.push(mesh);
  }

  /** 依遊戲狀態建立或更新所有城池 */
  syncCities(state: GameState) {
    for (const city of Object.values(state.cities)) {
      const entry = this.cities.get(city.id);
      if (!entry) this.createCity(city);
      else if (entry.owner !== city.owner) this.rebuildCity(city);
      this.updateLabel(state, city);
    }
  }

  private createCity(city: City) {
    const pos = this.tilePosition(city.tile);
    const holder = new THREE.Group();
    holder.position.copy(pos);
    this.root.add(holder);

    const territory = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 36),
      new THREE.MeshBasicMaterial({ color: ownerColor(city.owner), transparent: true, opacity: 0.28, depthWrite: false }),
    );
    territory.rotation.x = -Math.PI / 2;
    territory.position.set(pos.x, 0.04, pos.z);
    territory.renderOrder = 1;
    territory.visible = city.owner !== 'neutral';
    this.root.add(territory);

    const label = document.createElement('div');
    label.className = 'city-label';
    const labelObj = new CSS2DObject(label);
    labelObj.position.set(0, 4, 0);
    holder.add(labelObj);

    const visual = buildCityMesh(city.owner, city.capital);
    visual.group.scale.multiplyScalar(CITY_SCALE);
    holder.add(visual.group);
    this.cities.set(city.id, { visual, holder, territory, label, owner: city.owner });
  }

  private rebuildCity(city: City) {
    const e = this.cities.get(city.id)!;
    e.holder.remove(e.visual.group);
    e.visual = buildCityMesh(city.owner, city.capital);
    e.holder.add(e.visual.group);
    e.owner = city.owner;
    (e.territory.material as THREE.MeshBasicMaterial).color.setHex(ownerColor(city.owner));
    e.territory.visible = city.owner !== 'neutral';
    const target = (city.capital ? 1.25 : 1) * CITY_SCALE;
    e.visual.group.scale.setScalar(0.01);
    this.animator.tween(0.6, (t) => e.visual.group.scale.setScalar(Math.max(0.01, easeOut(t) * target)));
  }

  private updateLabel(state: GameState, city: City) {
    const e = this.cities.get(city.id)!;
    const tollText = city.owner === 'neutral' ? '' : `<small class="toll">💰${fmtStones(cityToll(state, city), true)}</small>`;
    e.label.innerHTML = `<span class="dot" style="background:${ownerCss(city.owner)}"></span>${city.capital ? '★' : ''}${city.name}<small>${ownerName(city.owner)}</small>${tollText}`;
  }

  setHover(index: number | null) {
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
      ((c as THREE.Mesh).material as THREE.Material).dispose();
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
        geo.dispose();
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
      .then(() => this.root.remove(beam));
  }

  /** 木頭路牌：立在岔路口通往前進方向的路上（避開城池建築），木板尖端指向目前的前進方向 */
  private makeSignpost(): THREE.Group {
    const wood = new THREE.MeshStandardMaterial({ color: 0xe0b872, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.95 });
    const paint = new THREE.MeshBasicMaterial({ color: 0xc8281c });
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 4.4, 8), dark);
    post.position.y = 2.2;
    g.add(post);
    const flat = (pts: [number, number][], depth: number, mat: THREE.Material, y: number, scale = 1) => {
      const sh = new THREE.Shape();
      pts.forEach(([x, z], i) => (i ? sh.lineTo(x * scale, z * scale) : sh.moveTo(x * scale, z * scale)));
      sh.closePath();
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2), mat);
      m.position.y = y;
      return m;
    };
    // 指向 +X 的箭頭形木板：深色外框、淺色木板、紅漆箭頭
    const board: [number, number][] = [[-2.2, -0.9], [1.3, -0.9], [2.9, 0], [1.3, 0.9], [-2.2, 0.9]];
    const sign = new THREE.Group();
    sign.add(
      flat(board, 0.16, dark, 4.3, 1.1),
      flat(board, 0.3, wood, 4.4),
      flat([[-1.5, -0.28], [0.6, -0.28], [0.6, -0.6], [2.2, 0], [0.6, 0.6], [0.6, 0.28], [-1.5, 0.28]], 0.06, paint, 4.72),
    );
    sign.name = 'sign';
    g.add(sign);
    g.scale.setScalar(1.3);
    return g;
  }

  syncForkArrows(state: GameState) {
    for (const tile of this.tiles) {
      if (tile.links.length < 3) continue;
      const target = this.tiles[state.forkDirections[tile.index]];
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
      const off = tile.kind === 'city' ? 6.5 : 3.2;
      const p = this.tilePosition(tile.index);
      sign.position.set(p.x + dx * off, p.y, p.z + dz * off);
      sign.getObjectByName('sign')!.rotation.y = Math.atan2(-dz, dx);
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
    const side = (slot - 1.5) * 0.7;
    g.position.set(p.x + dx * 2.6 - dz * side, p.y + 0.9, p.z + dz * 2.6 + dx * side);
    g.rotation.y = Math.atan2(dx, dz);
    g.visible = true;
  }

  /** 九州風雲的地圖標記：旅行商人、黃巾賊窩 */
  setEventMarkers(merchantTile: number | null, banditTiles: number[]) {
    for (const m of this.eventMarkers) {
      m.removeFromParent();
      m.traverse((o) => {
        if (o instanceof CSS2DObject) o.element.remove();
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
    this.time += dt;
    for (const m of this.eventMarkers) {
      const flag = m.children.find((c) => c.userData.wave);
      if (flag) flag.rotation.y = Math.sin(this.time * 3) * 0.4;
    }
    const t = this.time;
    for (const e of this.cities.values()) animateCity(e.visual, t);
    for (const b of this.buildings) animateBuilding(b, t);
    for (const h of this.highlights.children) {
      if (h.userData.baseScale) h.scale.setScalar(h.userData.baseScale * (1 + Math.sin(t * 5) * 0.08));
    }
    this.terrain.update(t);
  }
}
