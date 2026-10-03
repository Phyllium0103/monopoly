import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Character } from '../game/types';
import { FACTIONS } from '../faction/Faction';
import type { Animator } from '../scene/Animator';
import { easeInOut } from '../scene/Animator';

/** 以 Canvas 畫出紙片人立繪 */
function drawFigure(c: Character): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 192;
  const ctx = cv.getContext('2d')!;
  const f = FACTIONS[c.faction];
  const robe = f.css;

  ctx.save();
  // 紙片白邊
  ctx.shadowColor = 'rgba(255,255,255,1)';
  ctx.shadowBlur = 0;
  ctx.lineJoin = 'round';

  const outline = (draw: () => void, fill: string) => {
    ctx.beginPath();
    draw();
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#fffaf0';
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#2a1d14';
    ctx.stroke();
  };

  // 武器（在身後）
  ctx.lineCap = 'round';
  if (c.role === '武將') {
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(104, 186);
    ctx.lineTo(104, 22);
    ctx.stroke();
    ctx.strokeStyle = '#6b4424';
    ctx.lineWidth = 4;
    ctx.stroke();
    outline(() => {
      ctx.moveTo(104, 4);
      ctx.lineTo(112, 26);
      ctx.lineTo(104, 32);
      ctx.lineTo(96, 26);
      ctx.closePath();
    }, '#dfe8ef');
    ctx.fillStyle = '#d23a2a';
    ctx.fillRect(98, 33, 12, 6);
  } else if (c.role === '主公') {
    outline(() => {
      ctx.moveTo(100, 160);
      ctx.lineTo(106, 64);
      ctx.lineTo(112, 160);
      ctx.closePath();
    }, '#e8f2ff');
    ctx.fillStyle = '#d4a52a';
    ctx.fillRect(96, 156, 20, 6);
  } else if (c.role === '修士') {
    outline(() => {
      ctx.moveTo(18, 40);
      ctx.lineTo(24, 14);
      ctx.lineTo(30, 40);
      ctx.closePath();
    }, '#bff0ff');
  }

  // 長袍
  outline(() => {
    ctx.moveTo(44, 78);
    ctx.lineTo(84, 78);
    ctx.lineTo(100, 184);
    ctx.lineTo(28, 184);
    ctx.closePath();
  }, robe);
  // 衣襟
  ctx.strokeStyle = '#fffaf0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(52, 80);
  ctx.lineTo(64, 104);
  ctx.lineTo(76, 80);
  ctx.stroke();
  // 腰帶
  ctx.fillStyle = '#d4a52a';
  ctx.fillRect(38, 118, 52, 7);
  // 袖子
  outline(() => {
    ctx.moveTo(44, 82);
    ctx.lineTo(22, 132);
    ctx.lineTo(38, 138);
    ctx.lineTo(50, 104);
    ctx.closePath();
  }, robe);
  outline(() => {
    ctx.moveTo(84, 82);
    ctx.lineTo(104, 128);
    ctx.lineTo(90, 136);
    ctx.lineTo(78, 104);
    ctx.closePath();
  }, robe);

  // 頭
  outline(() => ctx.arc(64, 54, 24, 0, Math.PI * 2), '#f3d4b2');
  // 頭髮 / 頭飾
  ctx.fillStyle = '#1e1612';
  ctx.beginPath();
  ctx.arc(64, 50, 24, Math.PI, Math.PI * 2);
  ctx.fill();
  if (c.role === '主公') {
    outline(() => {
      ctx.moveTo(44, 32);
      ctx.lineTo(50, 14);
      ctx.lineTo(58, 26);
      ctx.lineTo(64, 8);
      ctx.lineTo(70, 26);
      ctx.lineTo(78, 14);
      ctx.lineTo(84, 32);
      ctx.closePath();
    }, '#e8c050');
  } else if (c.role === '武將') {
    outline(() => {
      ctx.moveTo(38, 50);
      ctx.quadraticCurveTo(64, 10, 90, 50);
      ctx.lineTo(84, 40);
      ctx.lineTo(44, 40);
      ctx.closePath();
    }, '#8a8f99');
    ctx.fillStyle = '#d23a2a';
    ctx.beginPath();
    ctx.moveTo(64, 26);
    ctx.quadraticCurveTo(80, 0, 60, 6);
    ctx.fill();
  } else if (c.role === '軍師') {
    outline(() => ctx.rect(50, 14, 28, 18), '#1e1612');
    // 羽扇
    outline(() => {
      ctx.moveTo(100, 118);
      ctx.quadraticCurveTo(122, 96, 110, 76);
      ctx.quadraticCurveTo(92, 86, 96, 116);
      ctx.closePath();
    }, '#f6f3ea');
  } else {
    outline(() => ctx.arc(64, 26, 9, 0, Math.PI * 2), '#1e1612');
    ctx.strokeStyle = '#7fe0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(48, 28);
    ctx.lineTo(80, 24);
    ctx.stroke();
  }
  // 眼睛
  ctx.fillStyle = '#1e1612';
  ctx.beginPath();
  ctx.arc(56, 58, 2.6, 0, Math.PI * 2);
  ctx.arc(72, 58, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e88a7a';
  ctx.beginPath();
  ctx.arc(52, 66, 3, 0, Math.PI * 2);
  ctx.arc(76, 66, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return cv;
}

export class CharacterSprite {
  group = new THREE.Group();
  private sprite: THREE.Sprite;
  private ring: THREE.Mesh;
  private shadow: THREE.Mesh;
  private label: HTMLDivElement;
  private baseY = 0;
  private moving = false;
  private phase = Math.random() * Math.PI * 2;
  selected = false;

  constructor(public character: Character) {
    const tex = new THREE.CanvasTexture(drawFigure(character));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1 }));
    this.sprite.center.set(0.5, 0);
    this.sprite.scale.set(2, 3, 1);
    this.sprite.userData = { pick: true, heroId: character.id };
    this.group.add(this.sprite);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.95, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.ring.visible = false;
    this.group.add(this.ring);

    this.label = document.createElement('div');
    this.label.className = 'hero-label';
    this.label.style.borderColor = FACTIONS[character.faction].css;
    this.label.textContent = character.name;
    const labelObj = new CSS2DObject(this.label);
    labelObj.position.set(0, 3.3, 0);
    this.group.add(labelObj);
  }

  setGroundPosition(p: THREE.Vector3) {
    this.group.position.copy(p);
    this.baseY = 0;
  }

  setSelected(v: boolean) {
    this.selected = v;
    this.ring.visible = v;
    this.label.classList.toggle('selected', v);
  }

  /** 已行動的角色變暗 */
  setDone(done: boolean) {
    (this.sprite.material as THREE.SpriteMaterial).color.setScalar(done ? 0.6 : 1);
    this.label.classList.toggle('done', done);
  }

  /** 沿路徑逐格跳躍移動 */
  async moveAlong(points: THREE.Vector3[], animator: Animator, onStep?: (p: THREE.Vector3) => void, longSteps: boolean[] = []) {
    this.moving = true;
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1];
      const to = points[i];
      const long = longSteps[i] ?? false;
      const dur = long ? 0.9 : 0.28;
      await animator.tween(dur, (t) => {
        const k = long ? easeInOut(t) : t;
        this.group.position.lerpVectors(from, to, k);
        const hop = long ? Math.sin(Math.PI * t) * 0.3 : Math.sin(Math.PI * t) * 0.8;
        this.sprite.position.y = hop;
        // 跳躍時的擠壓伸展
        const squash = 1 + Math.sin(Math.PI * t) * 0.12;
        this.sprite.scale.set(2 / squash, 3 * squash, 1);
        this.shadow.scale.setScalar(1 - hop * 0.3);
        onStep?.(this.group.position);
      });
    }
    this.sprite.position.y = 0;
    this.sprite.scale.set(2, 3, 1);
    this.moving = false;
  }

  update(dt: number, time: number) {
    if (!this.moving) {
      // Idle：上下浮動
      this.sprite.position.y = this.baseY + Math.sin(time * 2.2 + this.phase) * 0.06;
      const breathe = 1 + Math.sin(time * 2.2 + this.phase) * 0.015;
      this.sprite.scale.set(2, 3 * breathe, 1);
    }
    if (this.ring.visible) {
      this.ring.rotation.z += dt * 1.5;
      const s = 1 + Math.sin(time * 4) * 0.08;
      this.ring.scale.setScalar(s);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.label.remove();
    (this.sprite.material as THREE.SpriteMaterial).map?.dispose();
    this.sprite.material.dispose();
  }
}
