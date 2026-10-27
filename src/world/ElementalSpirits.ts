import * as THREE from 'three';
import type { ElementalSpirit } from '../game/types';
import { ELEMENTAL_SPIRIT_ART, SPIRIT_ICON_SIZE } from '../data/elementalSpirits';
import { SpiritAnimationClock } from './SpiritAnimation';
import { SPIRIT_CAP } from '../systems/ElementalSpiritSystem';
import { CELL_SIZE } from '../data/selectedBoard';

/** World-sized frame: its screen size scales with roads and buildings. */
export const SPIRIT_WORLD_SIZE = CELL_SIZE * 4 / 3;

const imageCache = new Map<string, HTMLImageElement>();
function image(url: string): HTMLImageElement {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image(); img.decoding = 'async'; img.src = url;
    imageCache.set(url, img);
  }
  return img;
}
interface Entry {
  spirit: ElementalSpirit; object: THREE.Sprite; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture;
  context: CanvasRenderingContext2D; clock: SpiritAnimationClock; painted: string;
}

/** Nameless world sprites whose feet stand at the actual road-cell centres. */
export class ElementalSpiritLayer {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  constructor(private tilePosition: (index: number) => THREE.Vector3) {}

  sync(spirits: readonly ElementalSpirit[], now = performance.now()) {
    const current = spirits.slice(0, SPIRIT_CAP), ids = new Set(current.map(s => s.id));
    for (const [id, entry] of this.entries) if (!ids.has(id)) this.remove(id, entry);
    for (const spirit of current) {
      let entry = this.entries.get(spirit.id);
      if (entry && entry.spirit.element !== spirit.element) {
        this.remove(spirit.id, entry); entry = undefined;
      }
      if (!entry) {
        const art = ELEMENTAL_SPIRIT_ART[spirit.element];
        const canvas = document.createElement('canvas');
        canvas.className = 'elemental-spirit';
        canvas.width = canvas.height = SPIRIT_ICON_SIZE * 2;
        const context = canvas.getContext('2d')!; context.imageSmoothingQuality = 'high';
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        const object = new THREE.Sprite(new THREE.SpriteMaterial({
          map: texture, transparent: true, alphaTest: .02, depthWrite: false, toneMapped: false,
        }));
        // Canvas uses a top origin, Sprite.center a bottom origin. Keep the same
        // resting-foot anchor for every frame so jumps retain their real motion.
        object.center.set(art.foot.x, 1 - art.foot.y);
        object.scale.set(SPIRIT_WORLD_SIZE, SPIRIT_WORLD_SIZE, 1);
        object.renderOrder = 2;
        this.group.add(object);
        entry = { spirit, object, canvas, context, texture, clock: new SpiritAnimationClock(now, art.actions), painted: '' };
        this.entries.set(spirit.id, entry);
        image(art.idle); for (const action of art.actions) image(action.url);
      }
      entry.spirit = spirit;
      entry.canvas.dataset.spiritId = spirit.id;
      entry.canvas.dataset.element = spirit.element;
      entry.canvas.dataset.tile = String(spirit.tile);
      entry.object.userData.spiritId = spirit.id;
      entry.object.userData.tile = spirit.tile;
      entry.object.position.copy(this.tilePosition(spirit.tile));
    }
    this.update(now);
  }

  playAtTile(tile: number, now = performance.now()): boolean {
    const entry = [...this.entries.values()].find(e => e.spirit.tile === tile);
    if (!entry || !entry.clock.trigger(now)) return false;
    this.update(now);
    return true;
  }

  update(now = performance.now()) {
    for (const entry of this.entries.values()) {
      const pose = entry.clock.sample(now), key = pose.action === null ? 'idle' : pose.action + ':' + pose.frame;
      if (key === entry.painted) continue;
      const art = ELEMENTAL_SPIRIT_ART[entry.spirit.element];
      const animation = pose.action === null ? null : art.actions[pose.action];
      const source = image(animation?.url ?? art.idle);
      if (!source.complete || !source.naturalWidth) continue;
      const ctx = entry.context, size = entry.canvas.width;
      ctx.clearRect(0, 0, size, size);
      if (animation) {
        const w = source.naturalWidth / animation.columns, h = source.naturalHeight / animation.rows;
        ctx.drawImage(source, (pose.frame % animation.columns) * w, Math.floor(pose.frame / animation.columns) * h, w, h, 0, 0, size, size);
      } else ctx.drawImage(source, 0, 0, size, size);
      entry.texture.needsUpdate = true;
      entry.painted = key;
      entry.canvas.dataset.animation = animation?.letter ?? 'idle';
      entry.canvas.dataset.frame = String(pose.frame);
    }
  }
  clear() { for (const [id, entry] of this.entries) this.remove(id, entry); }
  private remove(id: string, entry: Entry) {
    entry.object.removeFromParent(); entry.texture.dispose(); entry.object.material.dispose();
    entry.canvas.remove(); this.entries.delete(id);
  }
}

