import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { City, GameState, MapNode, TileKind } from '../game/types';
import { MapGraph } from './MapGraph';
import { Terrain } from './Terrain';
import { animateCity, buildCityMesh, type CityVisual } from './CityMesh';
import { ownerColor, ownerCss, ownerName } from '../faction/Faction';
import type { Animator } from '../scene/Animator';
import { easeOut } from '../scene/Animator';

const TILE_COLORS: Record<TileKind, number> = {
  road: 0xd8c49a,
  vein: 0x5fd4d0,
  market: 0xe8b84a,
  danger: 0xa8443a,
};

interface CityEntry {
  visual: CityVisual;
  holder: THREE.Group;
  territory: THREE.Mesh;
  border: THREE.Mesh;
  label: HTMLDivElement;
  owner: string;
}

export class World {
  root = new THREE.Group();
  map = new MapGraph();
  terrain: Terrain;
  pickables: THREE.Object3D[] = [];
  private cities = new Map<string, CityEntry>();
  private highlights = new THREE.Group();
  private hover: THREE.Mesh;
  private realmSpinners: THREE.Object3D[] = [];
  private time = 0;

  constructor(
    scene: THREE.Scene,
    private animator: Animator,
  ) {
    scene.add(this.root);
    this.terrain = new Terrain(this.map);
    this.root.add(this.terrain.group);
    this.root.add(this.highlights);

    for (const node of this.map.nodes.values()) {
      if (node.type === 'road') this.addTile(node);
      else if (node.type === 'realm') this.addRealm(node);
      this.addPicker(node);
    }

    this.hover = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.55, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.hover.rotation.x = -Math.PI / 2;
    this.hover.visible = false;
    this.root.add(this.hover);
  }

  ground(x: number, z: number) {
    return Math.max(this.terrain.heightAt(x, z), 0);
  }

  nodePosition(id: string): THREE.Vector3 {
    const n = this.map.node(id);
    const y = n.type === 'city' ? 0.35 : n.type === 'realm' ? 0.4 : 0.35;
    return new THREE.Vector3(n.pos.x, this.ground(n.pos.x, n.pos.z) + y, n.pos.z);
  }

  private addTile(node: MapNode) {
    const geo = new THREE.CylinderGeometry(0.85, 0.95, 0.25, 6);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: TILE_COLORS[node.tile], roughness: 0.7, flatShading: true }));
    m.position.set(node.pos.x, this.ground(node.pos.x, node.pos.z) + 0.15, node.pos.z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.root.add(m);
    if (node.tile !== 'road') {
      const icon = { vein: '✨', market: '💰', danger: '☠' }[node.tile];
      const el = document.createElement('div');
      el.className = 'tile-icon';
      el.textContent = icon;
      const label = new CSS2DObject(el);
      label.position.set(0, 0.6, 0);
      m.add(label);
    }
  }

  private addRealm(node: MapNode) {
    const g = new THREE.Group();
    g.position.set(node.pos.x, this.ground(node.pos.x, node.pos.z), node.pos.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.1, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x4d4a5a, flatShading: true }));
    base.position.y = 0.2;
    base.receiveShadow = true;
    base.castShadow = true;
    g.add(base);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.3), new THREE.MeshStandardMaterial({ color: 0x8d8899, flatShading: true }));
      pillar.position.set(Math.cos(a) * 1.4, 1.1, Math.sin(a) * 1.4);
      pillar.castShadow = true;
      g.add(pillar);
    }
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.6),
      new THREE.MeshStandardMaterial({ color: 0x9ef0ff, emissive: 0x2aa8d8, emissiveIntensity: 1.4, flatShading: true }),
    );
    crystal.position.y = 2;
    crystal.userData.bob = 2;
    g.add(crystal);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: 0x9ef0ff, transparent: true, opacity: 0.7 }));
    ring.position.y = 2;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    this.realmSpinners.push(crystal, ring);
    this.root.add(g);

    const el = document.createElement('div');
    el.className = 'realm-label';
    el.textContent = `🌀 ${node.name}`;
    const label = new CSS2DObject(el);
    label.position.set(0, 3.4, 0);
    g.add(label);
  }

  private addPicker(node: MapNode) {
    const r = node.type === 'city' ? 3 : node.type === 'realm' ? 2.2 : 1.2;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3, 8), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.copy(this.nodePosition(node.id)).setY(1.2);
    m.userData = { pick: true, nodeId: node.id };
    this.root.add(m);
    this.pickables.push(m);
  }

  /** 依遊戲狀態建立或重建所有城池 */
  syncCities(state: GameState) {
    for (const city of Object.values(state.cities)) {
      const entry = this.cities.get(city.id);
      if (!entry) this.createCity(city);
      else if (entry.owner !== city.owner) this.rebuildCity(city);
      this.updateLabel(city);
    }
  }

  private createCity(city: City) {
    const pos = this.nodePosition(city.id);
    const holder = new THREE.Group();
    holder.position.set(pos.x, pos.y - 0.35, pos.z);
    this.root.add(holder);

    const territory = new THREE.Mesh(
      new THREE.CircleGeometry(7, 40),
      new THREE.MeshBasicMaterial({ color: ownerColor(city.owner), transparent: true, opacity: 0.16, depthWrite: false }),
    );
    territory.rotation.x = -Math.PI / 2;
    territory.position.set(pos.x, 0.03, pos.z);
    territory.renderOrder = 1;
    this.root.add(territory);
    const border = new THREE.Mesh(
      new THREE.RingGeometry(6.75, 7, 48),
      new THREE.MeshBasicMaterial({ color: ownerColor(city.owner), transparent: true, opacity: 0.45, depthWrite: false }),
    );
    border.rotation.x = -Math.PI / 2;
    border.position.set(pos.x, 0.04, pos.z);
    border.renderOrder = 1;
    this.root.add(border);
    if (city.owner === 'neutral') territory.visible = border.visible = false;

    const label = document.createElement('div');
    label.className = 'city-label';
    const labelObj = new CSS2DObject(label);
    labelObj.position.set(0, 4.8, 0);
    holder.add(labelObj);

    const visual = buildCityMesh(city.owner, city.capital);
    holder.add(visual.group);
    this.cities.set(city.id, { visual, holder, territory, border, label, owner: city.owner });
  }

  private rebuildCity(city: City) {
    const e = this.cities.get(city.id)!;
    e.holder.remove(e.visual.group);
    e.visual = buildCityMesh(city.owner, city.capital);
    e.holder.add(e.visual.group);
    e.owner = city.owner;
    const c = ownerColor(city.owner);
    (e.territory.material as THREE.MeshBasicMaterial).color.setHex(c);
    (e.border.material as THREE.MeshBasicMaterial).color.setHex(c);
    e.territory.visible = e.border.visible = city.owner !== 'neutral';
    // 新城升起
    e.visual.group.scale.multiplyScalar(0.01);
    const target = city.capital ? 1.25 : 1;
    this.animator.tween(0.6, (t) => e.visual.group.scale.setScalar(Math.max(0.01, easeOut(t) * target)));
  }

  private updateLabel(city: City) {
    const e = this.cities.get(city.id)!;
    e.label.innerHTML = `<span class="dot" style="background:${ownerCss(city.owner)}"></span>${city.capital ? '★' : ''}${city.name}<small>${ownerName(city.owner)}</small>`;
  }

  setHover(nodeId: string | null) {
    if (!nodeId) {
      this.hover.visible = false;
      return;
    }
    const n = this.map.node(nodeId);
    const p = this.nodePosition(nodeId);
    const s = n.type === 'city' ? 2.6 : n.type === 'realm' ? 1.7 : 0.9;
    this.hover.scale.setScalar(s);
    this.hover.position.set(p.x, p.y - 0.1 + (n.type === 'road' ? 0.05 : 0), p.z);
    this.hover.visible = true;
  }

  /** 標示可移動的節點 */
  showReachable(ids: string[]) {
    this.clearReachable();
    const geo = new THREE.RingGeometry(0.9, 1.25, 32);
    for (const id of ids) {
      const n = this.map.node(id);
      const p = this.nodePosition(id);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.scale.setScalar(n.type === 'city' ? 2.4 : n.type === 'realm' ? 1.6 : 1);
      m.position.set(p.x, p.y + (n.type === 'road' ? 0.02 : -0.2), p.z);
      m.userData.baseScale = m.scale.x;
      this.highlights.add(m);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 3, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.set(p.x, p.y + 1.5, p.z);
      this.highlights.add(beam);
    }
  }

  clearReachable() {
    for (const c of [...this.highlights.children]) {
      this.highlights.remove(c);
      ((c as THREE.Mesh).material as THREE.Material).dispose();
    }
  }

  /** 佔領特效：光環擴散 + 金色粒子 */
  captureEffect(cityId: string, color: number) {
    const p = this.nodePosition(cityId);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.2, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, p.y + 0.2, p.z);
    this.root.add(ring);

    const count = 80;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      pos.set([p.x, p.y + 0.5, p.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      vel.push(new THREE.Vector3(Math.cos(a) * s, 3 + Math.random() * 5, Math.sin(a) * s));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd860, size: 0.35, transparent: true, depthWrite: false }));
    this.root.add(pts);

    let last = 0;
    this.animator
      .tween(1.6, (t) => {
        const dt = t - last;
        last = t;
        ring.scale.setScalar(1 + easeOut(t) * 7);
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - t;
        const arr = geo.attributes.position.array as Float32Array;
        for (let i = 0; i < count; i++) {
          vel[i].y -= 9 * dt * 1.6;
          arr[i * 3] += vel[i].x * dt * 1.6;
          arr[i * 3 + 1] += vel[i].y * dt * 1.6;
          arr[i * 3 + 2] += vel[i].z * dt * 1.6;
        }
        geo.attributes.position.needsUpdate = true;
        (pts.material as THREE.PointsMaterial).opacity = 1 - t * t;
      })
      .then(() => {
        this.root.remove(ring, pts);
        geo.dispose();
      });
  }

  /** 突破特效：光柱 */
  breakthroughEffect(pos: THREE.Vector3) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 1, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beam.position.set(pos.x, pos.y + 7, pos.z);
    this.root.add(beam);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(1.2, 0.06, 6, 32),
        new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
      );
      r.rotation.x = Math.PI / 2;
      r.position.copy(pos);
      this.root.add(r);
      rings.push(r);
    }
    this.animator
      .tween(1.8, (t) => {
        beam.scale.set(1 - t * 0.7, 1, 1 - t * 0.7);
        (beam.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
        rings.forEach((r, i) => {
          const k = Math.min(1, t * 1.4 + i * 0.12);
          r.position.y = pos.y + k * 5;
          r.scale.setScalar(1 + k);
          (r.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        });
      })
      .then(() => this.root.remove(beam, ...rings));
  }

  /** 天機陣特效 */
  formationEffect(cityId: string) {
    const p = this.nodePosition(cityId);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 3.4, 6),
      new THREE.MeshBasicMaterial({ color: 0xc9a0ff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, p.y + 0.3, p.z);
    this.root.add(ring);
    this.animator
      .tween(1.5, (t) => {
        ring.rotation.z = t * 4;
        ring.scale.setScalar(1.6 - t * 0.6);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
      })
      .then(() => this.root.remove(ring));
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    for (const e of this.cities.values()) animateCity(e.visual, t);
    for (const o of this.realmSpinners) {
      o.rotation.y = t * 1.2;
      if (o.userData.bob) o.position.y = o.userData.bob + Math.sin(t * 2) * 0.2;
    }
    for (const h of this.highlights.children) {
      if (h.userData.baseScale) {
        h.scale.setScalar(h.userData.baseScale * (1 + Math.sin(t * 5) * 0.08));
      }
    }
    this.terrain.update(t);
  }
}
