import * as THREE from 'three';
import type { Owner } from '../game/types';
import { ownerColor } from '../faction/Faction';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, opts: { emissive?: number; flat?: boolean } = {}) {
  const key = `${color}-${opts.emissive ?? 0}-${opts.flat ?? true}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: opts.flat ?? true });
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = 1.2;
    }
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 四角攢尖屋頂 */
function roof(size: number, h: number, color: number, y: number, x = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(size * 0.75, h, 4), mat(color));
  m.rotation.y = Math.PI / 4;
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  return m;
}

function walls(size: number, height: number, thick: number, color: number, y = 0) {
  const g = new THREE.Group();
  const half = size / 2;
  g.add(box(size, height, thick, color, 0, y, -half));
  g.add(box(size, height, thick, color, 0, y, half));
  g.add(box(thick, height, size, color, -half, y, 0));
  g.add(box(thick, height, size, color, half, y, 0));
  // 城門樓
  g.add(box(1.1, height + 0.5, thick + 0.3, color, 0, y, half));
  // 角樓
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(thick * 1.6, height + 0.35, thick * 1.6, color, sx * half, y, sz * half));
  return g;
}

function pagoda(levels: number, base: number, color: number, roofColor: number, y = 0) {
  const g = new THREE.Group();
  let cy = y;
  let s = base;
  for (let i = 0; i < levels; i++) {
    g.add(box(s, 0.55, s, color, 0, cy, 0));
    cy += 0.55;
    g.add(roof(s * 1.5, 0.35, roofColor, cy));
    cy += 0.3;
    s *= 0.8;
  }
  return { group: g, top: cy };
}

function flag(color: number, y: number, x: number, z: number) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 5), mat(0x3a2a1a));
  pole.position.y = 1;
  g.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
  cloth.position.set(0.45, 1.65, 0);
  g.add(cloth);
  g.position.set(x, y, z);
  g.userData.wave = cloth;
  return g;
}

export interface CityVisual {
  group: THREE.Group;
  animated: THREE.Object3D[];
  flags: THREE.Object3D[];
}

/** 依宗門風格以基本幾何體拼出城池 */
export function buildCityMesh(owner: Owner, capital: boolean): CityVisual {
  const g = new THREE.Group();
  const animated: THREE.Object3D[] = [];
  const flags: THREE.Object3D[] = [];
  const color = ownerColor(owner);
  const stone = 0xb8ad98;
  const darkStone = 0x8a8170;
  const wood = 0x7a4b2a;

  // 基座
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.2, 0.35, 10), mat(darkStone));
  base.position.y = 0.17;
  base.receiveShadow = true;
  base.castShadow = true;
  g.add(base);

  let y0 = 0.35;

  switch (owner) {
    case 'cao': {
      // 厚重城牆、軍營、鍛造工坊
      g.add(walls(3.8, 1.2, 0.55, 0x8d8f96, y0));
      const keep = box(1.6, 1.4, 1.6, 0x6d717c, 0, y0, -0.2);
      g.add(keep);
      g.add(roof(2.4, 0.9, color, y0 + 1.4, 0, -0.2));
      g.add(box(2.4, 0.5, 0.8, 0x5b5e66, -2.6, 0, 1.6));
      g.add(roof(2.2, 0.4, 0x2e3a5c, 0.5, -2.6, 1.6));
      g.add(box(0.9, 0.7, 0.9, 0x55504a, 2.6, 0, 1.5));
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 6), mat(0x3d3a36));
      chimney.position.set(2.6, 1.4, 1.5);
      g.add(chimney);
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xff7a2a, { emissive: 0xff5a10 }));
      ember.position.set(2.6, 2.2, 1.5);
      ember.userData.pulse = true;
      animated.push(ember);
      g.add(ember);
      break;
    }
    case 'liu': {
      // 山城、劍閣、靈峰
      const hill = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.8, 1.2, 8), mat(0x6f8a55));
      hill.position.y = y0 + 0.6;
      hill.castShadow = true;
      g.add(hill);
      y0 += 1.2;
      g.add(walls(3, 0.7, 0.35, stone, y0));
      const p = pagoda(4, 1.3, 0xd8cfb8, color, y0);
      g.add(p.group);
      const sword = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.04), mat(0xdff4ff, { emissive: 0x7fd8ff }));
      blade.position.y = -0.3;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), mat(0xd4a52a));
      guard.position.y = 0.42;
      sword.add(blade, guard);
      sword.position.y = p.top + 1.2;
      sword.userData.spin = 1.2;
      sword.userData.bob = p.top + 1.2;
      animated.push(sword);
      g.add(sword);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 5), mat(0x58704a));
      peak.position.set(-2.4, 1.3, -1.6);
      peak.castShadow = true;
      g.add(peak);
      break;
    }
    case 'sun': {
      // 水城、碼頭、商會
      const water = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), mat(0x3f8fc0, { flat: false }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(2.6, 0.37, 1.8);
      g.add(water);
      g.add(walls(3.4, 0.9, 0.4, 0xc9b99a, y0));
      g.add(box(1.5, 1.1, 1.5, 0xe6d8bb, 0, y0, -0.3));
      g.add(roof(2.4, 0.8, color, y0 + 1.1, 0, -0.3));
      g.add(box(0.5, 0.08, 2.2, wood, 2.1, 0.33, 1.6));
      const boat = new THREE.Group();
      boat.add(box(1.2, 0.25, 0.45, 0x8a5a32, 0, 0, 0));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), mat(wood));
      mast.position.y = 0.7;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xf2e6c8, side: THREE.DoubleSide }));
      sail.position.set(0, 0.75, 0);
      sail.rotation.y = Math.PI / 2;
      boat.add(mast, sail);
      boat.position.set(2.9, 0.3, 2.2);
      boat.userData.float = 0.3;
      animated.push(boat);
      g.add(boat);
      for (let i = 0; i < 3; i++) {
        g.add(box(0.55, 0.4, 0.55, 0xd9c49a, -2.5 + i * 0.7, 0, 2.2));
        g.add(roof(0.8, 0.3, [0xd64535, 0xe0a030, 0x3f8fc0][i], 0.4, -2.5 + i * 0.7, 2.2));
      }
      break;
    }
    case 'dong': {
      // 西涼：黑石要塞、魔焰高塔
      g.add(walls(3.4, 0.9, 0.38, 0x6e6578, y0));
      const yin = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24, 0, Math.PI), mat(0x1c1c22, { flat: false }));
      const yang = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24, Math.PI, Math.PI), mat(0xf2f0ea, { flat: false }));
      for (const m of [yin, yang]) {
        m.rotation.x = -Math.PI / 2;
        m.position.y = y0 + 0.02;
      }
      const yinyang = new THREE.Group();
      yinyang.add(yin, yang);
      yinyang.userData.spin = 0.4;
      animated.push(yinyang);
      g.add(yinyang);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 3.4, 8), mat(0x4a3f5c));
      tower.position.set(0, y0 + 1.7, 0);
      tower.castShadow = true;
      g.add(tower);
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), mat(0xc9a0ff, { emissive: 0x8a4fd0 }));
      orb.position.y = y0 + 4;
      orb.userData.spin = 1.5;
      orb.userData.bob = y0 + 4;
      animated.push(orb);
      g.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 24), mat(0xe8d080, { emissive: 0x9a7a20 }));
      ring.position.y = y0 + 4;
      ring.rotation.x = Math.PI / 2.5;
      ring.userData.spin = -0.9;
      animated.push(ring);
      g.add(ring);
      // 觀星台
      g.add(box(1.2, 0.6, 1.2, 0x5a5068, -2.4, 0, 1.6));
      g.add(box(0.8, 0.15, 0.8, 0xe8d080, -2.4, 0.6, 1.6));
      break;
    }
    default: {
      g.add(walls(3.2, 0.8, 0.35, stone, y0));
      g.add(box(1.3, 1, 1.3, 0xd6cbb5, 0, y0, 0));
      g.add(roof(2, 0.7, 0x6f6a60, y0 + 1, 0, 0));
    }
  }

  if (owner !== 'neutral') {
    flags.push(flag(color, 0, -1.7, -1.7), flag(color, 0, 1.7, -1.7));
    flags.forEach((f) => g.add(f));
  }

  if (capital) {
    g.scale.setScalar(1.25);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.08, 6, 40), mat(0xe8c050, { emissive: 0x6a4a00 }));
    crown.rotation.x = -Math.PI / 2;
    crown.position.y = 0.4;
    g.add(crown);
  }

  return { group: g, animated, flags };
}

export function animateCity(v: CityVisual, time: number) {
  for (const o of v.animated) {
    if (o.userData.spin) o.rotation.y = time * o.userData.spin;
    if (o.userData.bob !== undefined) o.position.y = o.userData.bob + Math.sin(time * 2) * 0.15;
    if (o.userData.float !== undefined) o.position.y = o.userData.float + Math.sin(time * 1.6) * 0.05;
    if (o.userData.pulse) o.scale.setScalar(1 + Math.sin(time * 6) * 0.15);
  }
  for (const f of v.flags) {
    const cloth = f.userData.wave as THREE.Object3D;
    cloth.rotation.y = Math.sin(time * 3 + f.position.x) * 0.3;
  }
}
