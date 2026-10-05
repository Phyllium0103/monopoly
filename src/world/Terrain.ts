import * as THREE from 'three';
import type { Vec2 } from '../game/types';
import { MAP_SCALE, MOUNTAIN_RANGES, YANGTZE, YELLOW_RIVER } from '../data/board';

const W = 160;
const D = 130;
const CENTER_Z = 4;

function segDist(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

function polyDist(px: number, pz: number, line: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < line.length - 1; i++) d = Math.min(d, segDist(px, pz, line[i], line[i + 1]));
  return d;
}

function noise(x: number, z: number): number {
  return (
    Math.sin(x * 0.21 + Math.cos(z * 0.13) * 2) * 0.5 +
    Math.sin(z * 0.27 + x * 0.05) * 0.35 +
    Math.sin((x + z) * 0.6) * 0.15
  );
}

function seaEdge(z: number) {
  return 60 + Math.sin(z * 0.12) * 3 + Math.sin(z * 0.31) * 1.2;
}

/** 平滑曲線帶狀幾何（河流、道路共用） */
export function ribbon(points: THREE.Vector3[], width: number, yFn: (p: THREE.Vector3) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    const dir = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);
    const y = yFn(p);
    pos.push(p.x + side.x, y, p.z + side.z, p.x - side.x, y, p.z - side.z);
    if (i < points.length - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Terrain {
  group = new THREE.Group();
  private nodePoints: Vec2[];
  private edgeSegs: [Vec2, Vec2][];
  private water: THREE.MeshStandardMaterial[] = [];

  constructor(points: Vec2[], segments: [Vec2, Vec2][]) {
    const unscale = (p: Vec2): Vec2 => ({ x: p.x / MAP_SCALE, z: p.z / MAP_SCALE });
    this.nodePoints = points.map(unscale);
    this.edgeSegs = segments.map(([a, b]) => [unscale(a), unscale(b)]);
    this.group.scale.set(MAP_SCALE, 1, MAP_SCALE);
    this.buildGround();
    this.buildSea();
    this.buildRivers();
    this.buildMountains();
    this.buildTrees();
    this.buildRoads();
  }

  private nearRoad(x: number, z: number): number {
    let d = Infinity;
    for (const p of this.nodePoints) d = Math.min(d, Math.hypot(x - p.x, z - p.z) - 2);
    for (const [a, b] of this.edgeSegs) d = Math.min(d, segDist(x, z, a, b));
    return d;
  }

  heightAt(x: number, z: number): number {
    let h = noise(x, z) * 0.26;
    // 城池與道路附近整平
    let nodeD = Infinity;
    for (const p of this.nodePoints) nodeD = Math.min(nodeD, Math.hypot(x - p.x, z - p.z));
    h *= THREE.MathUtils.smoothstep(nodeD, 6, 10);
    // 河道下切
    const rd = Math.min(polyDist(x, z, YANGTZE), polyDist(x, z, YELLOW_RIVER));
    if (rd < 3) h = THREE.MathUtils.lerp(-0.5, h, THREE.MathUtils.smoothstep(rd, 0.8, 3));
    // 東海
    const se = seaEdge(z);
    if (x > se - 3) h = THREE.MathUtils.lerp(h, -2.5, THREE.MathUtils.smoothstep(x, se - 3, se + 3));
    return h;
  }

  private buildGround() {
    const geo = new THREE.PlaneGeometry(W, D, W, D);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, CENTER_Z);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const loess = new THREE.Color(0xc8b37a);
    const grass = new THREE.Color(0x8db764);
    const jungle = new THREE.Color(0x5f9a52);
    const sand = new THREE.Color(0xe0d2a0);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      // 北方黃土、中原草原、南方叢林
      const north = THREE.MathUtils.smoothstep(-z, 5, 30);
      const south = THREE.MathUtils.smoothstep(z, 15, 40);
      tmp.copy(grass).lerp(loess, north * 0.8).lerp(jungle, south);
      const n = noise(x * 2.3, z * 2.1) * 0.05;
      tmp.offsetHSL(0, 0, n);
      if (h < -0.4) tmp.lerp(sand, 0.6);
      const roadD = this.nearRoad(x, z);
      if (roadD < 1.6) tmp.lerp(new THREE.Color(0xb9a37a), (1 - roadD / 1.6) * 0.25);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildSea() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f87b5, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.92 });
    this.water.push(mat);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.3;
    sea.receiveShadow = true;
    this.group.add(sea);
  }

  private buildRivers() {
    const mk = (line: Vec2[], width: number, color: number) => {
      const curve = new THREE.CatmullRomCurve3(line.map((p) => new THREE.Vector3(p.x, 0, p.z)));
      const pts = curve.getSpacedPoints(160);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 });
      this.water.push(mat);
      const mesh = new THREE.Mesh(ribbon(pts, width, () => -0.12), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    mk(YANGTZE, 2.4, 0x3f8fc0);
    mk(YELLOW_RIVER, 1.8, 0xb29a5a);
  }

  private buildMountains() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d7a62, flatShading: true, roughness: 1 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x5f7d4a, flatShading: true, roughness: 1 });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, flatShading: true, roughness: 0.8 });
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const range of MOUNTAIN_RANGES) {
      let placed = 0;
      for (let tries = 0; placed < range.count && tries < range.count * 8; tries++) {
        const x = range.center.x + (rand() * 2 - 1) * range.spread.x;
        const z = range.center.z + (rand() * 2 - 1) * range.spread.z;
        const r = 2 + rand() * 2.2;
        if (this.nearRoad(x, z) < r + 0.8) continue;
        if (polyDist(x, z, YANGTZE) < r + 1 || polyDist(x, z, YELLOW_RIVER) < r + 1) continue;
        const h = range.height * (0.6 + rand() * 0.6);
        const segs = 5 + Math.floor(rand() * 3);
        const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), h > 6 ? rockMat : greenMat);
        m.position.set(x, h / 2 - 0.2, z);
        m.rotation.y = rand() * Math.PI;
        m.castShadow = true;
        m.receiveShadow = true;
        this.group.add(m);
        if (h > 5.5) {
          const capH = h * 0.28;
          const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28 * 1.02, capH, segs), snowMat);
          cap.position.set(x, h - capH / 2 - 0.2 + 0.02, z);
          cap.rotation.y = m.rotation.y;
          this.group.add(cap);
        }
        placed++;
      }
    }
  }

  private buildTrees() {
    const count = 420;
    const trunkGeo = new THREE.ConeGeometry(0.55, 1.6, 5);
    trunkGeo.translate(0, 0.8, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f7a3c, flatShading: true });
    const trees = new THREE.InstancedMesh(trunkGeo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const color = new THREE.Color();
    let n = 0;
    for (let tries = 0; n < count && tries < count * 10; tries++) {
      const x = Math.random() * 130 - 62;
      const z = Math.random() * 110 - 52;
      if (x > seaEdge(z) - 4) continue;
      if (this.nearRoad(x, z) < 2.2) continue;
      if (polyDist(x, z, YANGTZE) < 2.5 || polyDist(x, z, YELLOW_RIVER) < 2.5) continue;
      // 北方樹少
      if (z < -10 && Math.random() < 0.6) continue;
      const sc = 0.7 + Math.random() * 0.8;
      p.set(x, this.heightAt(x, z) - 0.05, z);
      s.set(sc, sc * (0.9 + Math.random() * 0.5), sc);
      m.compose(p, q, s);
      trees.setMatrixAt(n, m);
      color.setHSL(0.27 + Math.random() * 0.08, 0.45, 0.25 + Math.random() * 0.12);
      trees.setColorAt(n, color);
      n++;
    }
    trees.count = n;
    trees.castShadow = true;
    this.group.add(trees);
  }

  private buildRoads() {
    const roadMat = new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 1 });
    for (const [a, b] of this.edgeSegs) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(2, Math.ceil(len / 0.8));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t));
      }
      const mesh = new THREE.Mesh(
        ribbon(pts, 1.1, (p) => Math.max(this.heightAt(p.x, p.z), 0.05) + 0.06),
        roadMat,
      );
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  update(time: number) {
    for (const m of this.water) m.emissive.setHSL(0.55, 0.5, 0.04 + Math.sin(time * 1.5) * 0.02);
  }
}
