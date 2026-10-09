import * as THREE from 'three';
import type { TileKind } from '../game/types';

const m = (color: number, emissive = 0) => {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  if (emissive) {
    mat.emissive = new THREE.Color(emissive);
    mat.emissiveIntensity = 1.1;
  }
  return mat;
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), m(color), x, y + h / 2, z);
}

function roof(size: number, h: number, color: number, y: number, x = 0, z = 0) {
  const r = mesh(new THREE.ConeGeometry(size * 0.75, h, 4), m(color), x, y + h / 2, z);
  r.rotation.y = Math.PI / 4;
  return r;
}

function base(color = 0x8a8170, r = 1.8) {
  const b = mesh(new THREE.CylinderGeometry(r, r + 0.2, 0.3, 8), m(color), 0, 0.15, 0);
  return b;
}

export interface BuildingVisual {
  group: THREE.Group;
  animated: THREE.Object3D[];
}

/** 特殊格子的建築造型 */
export function buildSpecial(kind: TileKind): BuildingVisual {
  const g = new THREE.Group();
  const animated: THREE.Object3D[] = [];
  switch (kind) {
    case 'treasure': {
      // 天寶商行：金頂樓閣 + 浮空元寶
      g.add(base(0x6a5030));
      g.add(box(1.6, 1.1, 1.4, 0x9a2a1a, 0, 0.3, 0));
      g.add(roof(2.4, 0.7, 0xe8b84a, 1.4));
      const ingot = mesh(new THREE.TorusGeometry(0.3, 0.14, 6, 12), m(0xffd860, 0x8a6a00), 0, 2.8, 0);
      ingot.userData.spin = 1.5;
      ingot.userData.bob = 2.8;
      animated.push(ingot);
      g.add(ingot);
      break;
    }
    case 'herb': {
      // 百草堂：綠瓦藥舖 + 葫蘆
      g.add(base(0x5a6a3a));
      g.add(box(1.6, 0.9, 1.3, 0xe6d8bb, 0, 0.3, 0));
      g.add(roof(2.3, 0.6, 0x3f8a4a, 1.2));
      const gourd = new THREE.Group();
      gourd.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), m(0xd8a040), 0, 0, 0));
      gourd.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), m(0xd8a040), 0, 0.42, 0));
      gourd.position.set(0, 2.4, 0);
      gourd.userData.bob = 2.4;
      animated.push(gourd);
      g.add(gourd);
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.ConeGeometry(0.18, 0.5, 5), m(0x5fc46a), -1.3 + i * 0.25, 0.55, 1.2));
      break;
    }
    case 'forge': {
      // 天工坊：石砌工坊 + 鐵砧 + 爐火
      g.add(base(0x5a5450));
      g.add(box(1.7, 0.9, 1.3, 0x7a7068, 0, 0.3, -0.2));
      g.add(roof(2.3, 0.5, 0x3a3634, 1.2, 0, -0.2));
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.6, 6), m(0x3d3a36), 0.6, 1.9, -0.4));
      const fire = mesh(new THREE.SphereGeometry(0.28, 8, 6), m(0xff7a2a, 0xff5010), 0.6, 2.8, -0.4);
      fire.userData.pulse = true;
      animated.push(fire);
      g.add(fire);
      g.add(box(0.6, 0.35, 0.3, 0x2a2a2e, -0.5, 0.3, 1));
      break;
    }
    case 'library': {
      // 藏經閣：三層樓閣
      g.add(base(0x6a5a48));
      let y = 0.3;
      let size = 1.5;
      for (let i = 0; i < 3; i++) {
        g.add(box(size, 0.6, size, 0xd8c8a0, 0, y, 0));
        y += 0.6;
        g.add(roof(size * 1.45, 0.4, 0x5a3a8a, y));
        y += 0.32;
        size *= 0.78;
      }
      const scroll = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), m(0xf2e6c8, 0x6a5a30), 0, y + 0.8, 0);
      scroll.rotation.z = Math.PI / 2;
      scroll.userData.spin = 1;
      scroll.userData.bob = y + 0.8;
      animated.push(scroll);
      g.add(scroll);
      break;
    }
    case 'beast': {
      // 萬獸園：柵欄 + 靈獸雕像
      g.add(base(0x5a6a3a, 2));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.add(box(0.12, 0.6, 0.12, 0x7a4b2a, Math.cos(a) * 1.7, 0.3, Math.sin(a) * 1.7));
      }
      const beast = new THREE.Group();
      beast.add(mesh(new THREE.BoxGeometry(1, 0.55, 0.5), m(0xe8e0d0), 0, 0, 0));
      beast.add(mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), m(0xe8e0d0), 0.6, 0.3, 0));
      beast.add(mesh(new THREE.ConeGeometry(0.08, 0.35, 4), m(0xffd860), 0.65, 0.65, 0));
      for (const [x, z] of [[-0.35, 0.18], [-0.35, -0.18], [0.35, 0.18], [0.35, -0.18]]) beast.add(mesh(new THREE.BoxGeometry(0.14, 0.4, 0.14), m(0xe8e0d0), x, -0.4, z));
      beast.position.y = 1;
      beast.userData.spin = 0.5;
      animated.push(beast);
      g.add(beast);
      break;
    }
    case 'tavern': {
      // 聽風樓：高樓 + 風旗燈籠
      g.add(base(0x6a5030));
      g.add(box(1.2, 2.2, 1.2, 0x8a3a2a, 0, 0.3, 0));
      g.add(roof(1.8, 0.6, 0x2a2a30, 2.5));
      for (const x of [-0.7, 0.7]) {
        const lantern = mesh(new THREE.SphereGeometry(0.18, 8, 6), m(0xff5a3a, 0xc02a10), x, 2.2, 0.7);
        g.add(lantern);
      }
      const banner = mesh(new THREE.PlaneGeometry(0.4, 1.2), new THREE.MeshStandardMaterial({ color: 0xf2e6c8, side: THREE.DoubleSide }), 0.9, 2.6, 0);
      banner.userData.wave = true;
      animated.push(banner);
      g.add(banner);
      break;
    }
    case 'casino': {
      // 賭坊：朱紅樓閣 + 金頂，屋頂上一顆旋轉的大骰子
      g.add(base(0x4a2a1a));
      g.add(box(1.6, 1.4, 1.3, 0x9a1f1f, 0, 0.3, 0));
      g.add(roof(2.3, 0.55, 0xd9a63a, 1.7));
      g.add(box(0.5, 0.75, 0.05, 0x2a1408, 0, 0.3, 0.66));
      for (const x of [-0.95, 0.95]) g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), m(0xffc040, 0xd08a10), x, 1.45, 0.55));
      const die = mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), m(0xf7f1e3), 0, 2.75, 0);
      const pip = m(0xc8202a);
      for (const [x, y, z] of [[0, 0.28, 0], [0, 0, 0.28], [0.28, 0, 0]]) die.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), pip, x, y, z));
      die.rotation.set(0.6, 0, 0.6);
      die.userData.spin = 1.2;
      die.userData.bob = 2.75;
      animated.push(die);
      g.add(die);
      break;
    }
    case 'vein': {
      g.add(mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.2, 8), m(0x2a4a5a), 0, 0.1, 0));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const crystal = mesh(new THREE.OctahedronGeometry(0.45 + i * 0.1), m(0x7ae8ff, 0x1a98c8), Math.cos(a) * 0.7, 0.9, Math.sin(a) * 0.7);
        crystal.userData.spin = 0.8 + i * 0.3;
        crystal.userData.bob = 0.9;
        animated.push(crystal);
        g.add(crystal);
      }
      break;
    }
    case 'portal': {
      g.add(mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.25, 16), m(0x3a2a5a), 0, 0.13, 0));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 8, 32), new THREE.MeshBasicMaterial({ color: 0xc9a0ff, transparent: true, opacity: 0.85 }));
      ring.position.y = 1.3;
      ring.userData.spin = 1.4;
      animated.push(ring);
      g.add(ring);
      const core = mesh(new THREE.OctahedronGeometry(0.4), m(0xe0c8ff, 0x8a4ad8), 0, 1.3, 0);
      core.userData.spin = -2;
      animated.push(core);
      g.add(core);
      break;
    }
    case 'realm': {
      g.add(mesh(new THREE.CylinderGeometry(1.8, 2.1, 0.4, 8), m(0x4d4a5a), 0, 0.2, 0));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        g.add(mesh(new THREE.BoxGeometry(0.3, 1.8, 0.3), m(0x8d8899), Math.cos(a) * 1.4, 1.1, Math.sin(a) * 1.4));
      }
      const crystal = mesh(new THREE.OctahedronGeometry(0.6), m(0x9ef0ff, 0x2aa8d8), 0, 2, 0);
      crystal.userData.spin = 1.2;
      crystal.userData.bob = 2;
      animated.push(crystal);
      g.add(crystal);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: 0x9ef0ff, transparent: true, opacity: 0.7 }));
      ring.position.y = 2;
      ring.rotation.x = Math.PI / 2;
      ring.userData.spin = -0.8;
      animated.push(ring);
      g.add(ring);
      break;
    }
    default: {
      g.add(mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.25, 6), m(0xd8c49a), 0, 0.13, 0));
    }
  }
  return { group: g, animated };
}

export function animateBuilding(v: BuildingVisual, time: number) {
  for (const o of v.animated) {
    if (o.userData.spin) o.rotation.y = time * o.userData.spin;
    if (o.userData.bob !== undefined) o.position.y = o.userData.bob + Math.sin(time * 2) * 0.15;
    if (o.userData.pulse) o.scale.setScalar(1 + Math.sin(time * 6) * 0.15);
    if (o.userData.wave) o.rotation.y = Math.sin(time * 3) * 0.4;
  }
}
