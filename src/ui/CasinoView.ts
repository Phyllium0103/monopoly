import * as THREE from 'three';
import type { Lord } from '../game/types';
import { fmtStones } from '../game/Currency';
import { CASINO_MIN_BET, PAYOUT, diceTotal, isTriple, maxBet, playCasino, type CasinoResult, type Dice } from '../systems/CasinoSystem';
import type { Dialog } from './Dialog';

// ───────────────────────── 骰子貼圖 ─────────────────────────

/** 骰面點數位置（3×3 格） */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

const faceCache = new Map<number, THREE.Texture>();
function faceTexture(value: number): THREE.Texture {
  const hit = faceCache.get(value);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f1e3';
  g.fillRect(0, 0, 128, 128);
  // 中式骰子：一點、四點為紅色，一點特別大
  g.fillStyle = value === 1 || value === 4 ? '#c8202a' : '#1c1410';
  const r = value === 1 ? 20 : 11;
  for (const [x, y] of PIPS[value]) {
    g.beginPath();
    g.arc(30 + x * 34, 30 + y * 34, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(value, tex);
  return tex;
}

/** BoxGeometry 面的順序為 +x、-x、+y、-y、+z、-z；對面相加為 7 */
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
/** 讓指定點數朝上的旋轉 */
const UP_ROTATION: Record<number, [number, number]> = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] };

const DIE = 0.5;

function makeDie(): THREE.Group {
  const holder = new THREE.Group();
  const mats = FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.45 }));
  const die = new THREE.Mesh(new THREE.BoxGeometry(DIE, DIE, DIE), mats);
  die.castShadow = true;
  holder.add(die);
  return holder;
}

function setDie(holder: THREE.Group, value: number) {
  const [rx, rz] = UP_ROTATION[value];
  holder.children[0].rotation.set(rx, 0, rz);
  holder.rotation.y = (Math.random() - 0.5) * 1.2;
}

// ───────────────────────── 骰盅與桌面 ─────────────────────────

function makeCup(): THREE.Group {
  const cup = new THREE.Group();
  const lacquer = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a63a, roughness: 0.3, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.82, 1.05, 32, 1, true), lacquer);
  body.position.y = 0.525;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 32), lacquer);
  top.position.y = 1.08;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.04, 8, 40), gold);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.08;
  const band2 = band.clone();
  band2.scale.setScalar(0.79);
  band2.position.y = 0.96;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), gold);
  knob.position.y = 1.18;
  for (const m of [body, top, band, band2, knob]) {
    m.castShadow = true;
    cup.add(m);
  }
  return cup;
}

interface Station {
  root: THREE.Group;
  cup: THREE.Group;
  dice: THREE.Group[];
}

function makeStation(z: number, plateColor: number): Station {
  const root = new THREE.Group();
  root.position.z = z;
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.08, 40), new THREE.MeshStandardMaterial({ color: plateColor, roughness: 0.6 }));
  plate.position.y = 0.04;
  plate.receiveShadow = true;
  root.add(plate);
  const dice = [0, 1, 2].map((i) => {
    const d = makeDie();
    const a = (i / 3) * Math.PI * 2 + 0.3;
    d.position.set(Math.cos(a) * 0.36, 0.08 + DIE / 2, Math.sin(a) * 0.36);
    setDie(d, 1 + Math.floor(Math.random() * 6));
    root.add(d);
    return d;
  });
  const cup = makeCup();
  cup.position.y = 0.08;
  root.add(cup);
  return { root, cup, dice };
}

// ───────────────────────── 場景 ─────────────────────────

class DiceTable {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private tweens: ((now: number) => boolean)[] = [];
  private raf = 0;
  readonly dealer: Station;
  readonly player: Station;

  constructor(private host: HTMLElement) {
    const w = host.clientWidth || 640, h = host.clientHeight || 300;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100);
    this.camera.position.set(0, 6.6, 4.9);
    this.camera.lookAt(0, 0, 0.1);

    this.scene.add(new THREE.AmbientLight(0xfff2dd, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 8, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    const warm = new THREE.PointLight(0xffb060, 18, 14);
    warm.position.set(-3, 3, -1);
    this.scene.add(warm);

    // 綠絨賭桌與木框
    const felt = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.2, 64), new THREE.MeshStandardMaterial({ color: 0x1d5a3a, roughness: 0.95 }));
    felt.position.y = -0.1;
    felt.receiveShadow = true;
    this.scene.add(felt);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.18, 12, 80), new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.5 }));
    rim.rotation.x = Math.PI / 2;
    this.scene.add(rim);

    this.dealer = makeStation(-1.25, 0x2a2a2a);
    this.player = makeStation(1.35, 0xe8dcc0);
    this.scene.add(this.dealer.root, this.player.root);

    const loop = (now: number) => {
      this.tweens = this.tweens.filter((t) => t(now));
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** 逐格動畫，t 由 0 到 1 */
  private tween(ms: number, step: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      this.tweens.push((now) => {
        const t = Math.min(1, (now - start) / ms);
        step(t);
        if (t >= 1) resolve();
        return t < 1;
      });
    });
  }

  private wait(ms: number) {
    return this.tween(ms, () => {});
  }

  /** 搖骰：兩個骰盅提起晃動，落下時骰子已換成結果 */
  async shake(player: Dice, dealer: Dice, speed: number) {
    const ms = 1300 / speed;
    const stations = [this.dealer, this.player];
    await this.tween(ms, (t) => {
      const lift = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.35;
      stations.forEach((s, i) => {
        const phase = t * Math.PI * 14 + i * 1.3;
        s.cup.position.set(Math.sin(phase) * 0.12 * (1 - t), 0.08 + lift, Math.cos(phase * 0.7) * 0.08 * (1 - t));
        s.cup.rotation.set(Math.cos(phase) * 0.12 * (1 - t), 0, Math.sin(phase) * 0.14 * (1 - t));
        // 骰子在盅裡跳動
        s.dice.forEach((d, j) => {
          d.position.y = 0.08 + DIE / 2 + Math.abs(Math.sin(phase * 1.3 + j)) * 0.12 * (1 - t);
          d.children[0].rotation.x += 0.4 * (1 - t);
          d.children[0].rotation.z += 0.3 * (1 - t);
        });
      });
    });
    stations.forEach((s, i) => {
      s.cup.position.set(0, 0.08, 0);
      s.cup.rotation.set(0, 0, 0);
      const values = i === 0 ? dealer : player;
      s.dice.forEach((d, j) => {
        d.position.y = 0.08 + DIE / 2;
        setDie(d, values[j]);
      });
    });
  }

  /** 開盅：骰盅提起並移到旁邊，露出骰子 */
  async reveal(who: 'dealer' | 'player', speed: number) {
    const s = who === 'dealer' ? this.dealer : this.player;
    await this.tween(650 / speed, (t) => {
      const e = 1 - (1 - t) ** 3;
      s.cup.position.set(e * 1.75, 0.08 + Math.sin(t * Math.PI) * 0.9 + e * 0.15, 0);
      s.cup.rotation.z = -e * 0.35;
    });
    await this.wait(250 / speed);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) if (!(m.map && [...faceCache.values()].includes(m.map))) m.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.host.innerHTML = '';
  }
}

// ───────────────────────── 視窗 ─────────────────────────

const OUTCOME_TEXT: Record<CasinoResult['outcome'], string> = {
  win: '你贏了！1 賠 1',
  triple: '豹子！1 賠 3',
  push: '和局，退還賭注',
  lose: '莊家贏了',
};

const diceText = (d: Dice) => `${d.join('・')}＝${diceTotal(d)}${isTriple(d) ? '（豹子）' : ''}`;

/** 賭坊：每次造訪只能賭一把；離開或未下注回傳 null。 */
export function openCasino(dialog: Dialog, lord: Lord, speed: () => number): Promise<CasinoResult | null> {
  let result: CasinoResult | null = null;
  let table: DiceTable | null = null;
  const cleanup = () => {
    table?.dispose();
    table = null;
  };
  return dialog.custom<CasinoResult | null>(
    '🎲 賭坊・骰盅比大小',
    (body, done) => {
      const top = maxBet(lord);
      body.innerHTML = `
        <p class="dialog-text">與荷官各搖三顆骰子比總點數。<b>贏 1 賠 1</b>；<b>豹子</b>（三顆相同）勝過任何點數，<b>1 賠 3</b>；點數相同為和局，退還賭注。每次進門只能賭一把。</p>
        <div class="wallet">持有靈石：<b class="cz-wallet">${fmtStones(lord.stones)}</b></div>
        <div class="casino-stage">
          <div class="cz-canvas"></div>
          <div class="cz-label dealer">莊家<b>？</b></div>
          <div class="cz-label player">你<b>？</b></div>
        </div>
        <div class="casino-bet"></div>
        <div class="cz-result"></div>
        <div class="dialog-buttons"></div>`;
      table = new DiceTable(body.querySelector('.cz-canvas') as HTMLElement);
      const betBox = body.querySelector('.casino-bet') as HTMLElement;
      const buttons = body.querySelector('.dialog-buttons') as HTMLElement;
      const leave = document.createElement('button');
      leave.className = 'btn';
      leave.textContent = '離開';
      leave.onclick = () => {
        cleanup();
        done(result);
      };

      if (top < CASINO_MIN_BET) {
        betBox.innerHTML = `<p class="muted">囊中羞澀，至少要有 ${fmtStones(CASINO_MIN_BET)} 才能下注。</p>`;
        buttons.appendChild(leave);
        return;
      }

      let bet = Math.min(top, Math.max(CASINO_MIN_BET, Math.round(top / 10 / CASINO_MIN_BET) * CASINO_MIN_BET));
      betBox.innerHTML = `
        <div class="slider-value"></div>
        <input type="range" min="${CASINO_MIN_BET}" max="${top}" step="${CASINO_MIN_BET}">
        <div class="slider-quick"></div>
        <div class="slider-preview"></div>`;
      const input = betBox.querySelector('input') as HTMLInputElement;
      const value = betBox.querySelector('.slider-value') as HTMLElement;
      const preview = betBox.querySelector('.slider-preview') as HTMLElement;
      const roll = document.createElement('button');
      roll.className = 'btn primary';
      const render = () => {
        input.value = String(bet);
        value.innerHTML = `下注 <b>${fmtStones(bet)}</b>`;
        preview.innerHTML = `贏得 +${fmtStones(bet * PAYOUT.win)}・豹子 +${fmtStones(bet * PAYOUT.triple)}・輸掉 −${fmtStones(bet)}`;
        roll.textContent = `🎲 開骰（${fmtStones(bet)}）`;
      };
      const set = (v: number) => {
        bet = Math.max(CASINO_MIN_BET, Math.min(top, Math.round(v / CASINO_MIN_BET) * CASINO_MIN_BET));
        render();
      };
      input.oninput = () => set(Number(input.value));
      const quick = betBox.querySelector('.slider-quick') as HTMLElement;
      for (const [label, ratio] of [['最少', 0], ['¼', 0.25], ['½', 0.5], ['全部', 1]] as const) {
        const b = document.createElement('button');
        b.className = 'btn mini';
        b.textContent = label;
        b.onclick = () => set(ratio === 0 ? CASINO_MIN_BET : top * ratio);
        quick.appendChild(b);
      }

      roll.onclick = async () => {
        if (result) return;
        // 先結算再播動畫；中途關掉視窗也不會重賭
        result = playCasino(lord, bet);
        betBox.remove();
        roll.remove();
        leave.disabled = true;
        const r = result;
        const sp = Math.max(1, speed());
        const show = (who: 'dealer' | 'player', d: Dice) => {
          (body.querySelector(`.cz-label.${who} b`) as HTMLElement).textContent = diceText(d);
        };
        await table?.shake(r.player, r.dealer, sp);
        await table?.reveal('dealer', sp);
        show('dealer', r.dealer);
        await table?.reveal('player', sp);
        show('player', r.player);
        const res = body.querySelector('.cz-result') as HTMLElement;
        res.className = `cz-result ${r.net > 0 ? 'win' : r.net < 0 ? 'lose' : 'push'}`;
        res.innerHTML = `${OUTCOME_TEXT[r.outcome]}　${r.net > 0 ? '+' : r.net < 0 ? '−' : '±'}${fmtStones(Math.abs(r.net))}`;
        (body.querySelector('.cz-wallet') as HTMLElement).textContent = fmtStones(lord.stones);
        leave.disabled = false;
      };
      buttons.append(roll, leave);
      render();
    },
    true,
    () => {
      cleanup();
      return result;
    },
  );
}
