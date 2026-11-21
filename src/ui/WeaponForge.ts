import type { WeaponUpgradeNotice } from '../engine/prompts';
import { WEAPON_GRADES, WEAPON_PENETRATION } from '../data/weaponCatalog';
import { WEAPON_ICON_BY_GENERAL } from '../data/weaponIcons';
import { weaponIconUrl } from './Icons';
import { createForgeEffects, drawForgeArt, ease, forgeDuration, forgeHits, mix, range } from './weaponForgeEffects';

const width = 960;
const height = 480;
const art = {
  anvil: new URL('./weapon-forge-anvil.webp', import.meta.url).href,
  hammer: new URL('./weapon-forge-hammer.webp', import.meta.url).href,
  panel: new URL('./weapon-forge-panel.webp', import.meta.url).href,
};

type Placement = { x: number; y: number; width: number; angle: number; resultWidth: number; contact: [number, number] };
const placements: Record<string, Placement> = {
  '05-01': { x: 478, y: 269, width: 219, angle: .78, resultWidth: 258, contact: [590, 273] },
  '02-01': { x: 478, y: 266, width: 190, angle: .73, resultWidth: 218, contact: [422, 259] },
  '06-01': { x: 478, y: 269, width: 236, angle: .77, resultWidth: 252, contact: [386, 262] },
  '11-01': { x: 478, y: 266, width: 182, angle: .74, resultWidth: 225, contact: [472, 252] },
  '14-01': { x: 478, y: 265, width: 135, angle: .61, resultWidth: 188, contact: [452, 266] },
  '16-01': { x: 478, y: 268, width: 185, angle: .73, resultWidth: 223, contact: [438, 266] },
};

async function image(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

// Leave the game's illustrations intact. Trim their transparent margins for the
// animation, then use the visible silhouette to seat the hammer on the weapon.
function cropWeapon(img: HTMLImageElement) {
  const buffer = document.createElement('canvas');
  const scale = Math.min(1, 390 / Math.max(img.naturalWidth, img.naturalHeight));
  buffer.width = Math.max(1, Math.round(img.naturalWidth * scale));
  buffer.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = buffer.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(img, 0, 0, buffer.width, buffer.height);
  const pixels = context.getImageData(0, 0, buffer.width, buffer.height);
  let left = buffer.width, top = buffer.height, right = -1, bottom = -1;
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      if (pixels.data[(y * buffer.width + x) * 4 + 3] < 22) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error('Empty weapon illustration');
  buffer.width = right - left + 1;
  buffer.height = bottom - top + 1;
  context.putImageData(pixels, -left, -top);
  return buffer;
}

function findPlacement(weapon: HTMLCanvasElement, iconId?: string): Placement {
  const aspect = weapon.width / weapon.height;
  const alternateWidth = Math.min(208, 202 * aspect);
  const base = placements[iconId ?? ''] ?? {
    x: 478, y: 266, width: alternateWidth, angle: .72,
    resultWidth: Math.min(252, 260 * aspect), contact: [487, 264] as [number, number],
  };
  const sample = document.createElement('canvas');
  sample.width = 440;
  sample.height = 72;
  const x0 = 260, y0 = 228;
  const context = sample.getContext('2d', { willReadFrequently: true })!;
  drawForgeArt(context, weapon, aspect, { ...base, x: base.x - x0, y: base.y - y0 });
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const [targetX, targetY] = base.contact;
  let best = Infinity;
  let contact = base.contact;
  for (let y = 244; y <= 289; y++) {
    for (let x = 300; x < 670; x++) {
      if (pixels[((y - y0) * sample.width + x - x0) * 4 + 3] < 160) continue;
      const score = (x - targetX) ** 2 + (y - targetY) ** 2 * .75;
      if (score >= best) continue;
      best = score;
      contact = [x, y];
    }
  }
  return { ...base, contact };
}

export class WeaponForge {
  private readonly canvas = document.createElement('canvas');
  private readonly plate = document.createElement('figure');
  private readonly copy = document.createElement('div');
  private readonly context = this.canvas.getContext('2d');
  private request = 0;
  private timeout = 0;
  private started = 0;
  private finished = false;
  private disposed = false;
  private draw: ((t: number) => void) | null = null;
  private readonly weaponUrl: string;

  constructor(private card: HTMLDivElement, private button: HTMLButtonElement, data: WeaponUpgradeNotice) {
    card.className = 'dialog weapon-forge';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', '本命武器升階');
    card.dataset.animation = 'loading';
    this.plate.className = 'weapon-forge-plate';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.copy.className = 'weapon-forge-copy';
    this.copy.hidden = true;
    this.copy.innerHTML = '<h2>升階成功</h2><div><strong></strong><small></small></div><dl></dl>';
    this.copy.querySelector('strong')!.textContent = data.weaponName;
    this.copy.style.setProperty('--title-fit', 28.8 / Math.max(1, Array.from(data.weaponName).length) + 'cqw');
    this.copy.querySelector('small')!.textContent = data.generalName + ' · 本命武器';
    const stats = this.copy.querySelector('dl')!;
    stats.append(
      this.stat('品階', WEAPON_GRADES[data.stage], WEAPON_GRADES[data.stage + 1], data.stage),
      this.stat('無視防禦', this.penetration(data.stage), this.penetration(data.stage + 1)),
    );
    this.plate.append(this.canvas, this.copy);
    const footer = document.createElement('div');
    footer.className = 'weapon-forge-footer';
    button.className = 'weapon-forge-confirm';
    button.hidden = true;
    footer.append(button);
    card.replaceChildren(this.plate, footer);
    card.tabIndex = -1;
    card.focus({ preventScroll: true });

    const url = this.weaponUrl = weaponIconUrl(data.generalId);
    if (!this.context) { this.fallback(url); return; }
    const scale = Math.max(.5, Math.min(1.5, this.plate.clientWidth * devicePixelRatio / width));
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);
    this.context.scale(this.canvas.width / width, this.canvas.height / height);
    this.timeout = window.setTimeout(() => this.fallback(url), 5000);
    void Promise.all([image(art.anvil), image(art.hammer), image(art.panel), image(url)]).then(([anvil, hammer, panel, source]) => {
      if (this.disposed || this.finished) return;
      clearTimeout(this.timeout);
      this.draw = this.makeScene(anvil, hammer, panel, cropWeapon(source), data);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.finish();
      else {
        this.started = performance.now();
        this.draw(0);
        this.request = requestAnimationFrame(this.tick);
      }
    }).catch(() => this.fallback(url));
  }

  skip(): boolean {
    if (this.finished || this.disposed) return false;
    if (this.draw) this.finish();
    else {
      // The result must be reachable even when its illustrations are still loading.
      this.fallback(this.weaponUrl);
    }
    return true;
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timeout);
    cancelAnimationFrame(this.request);
  }

  private penetration(stage: number) {
    return Math.round(WEAPON_PENETRATION[stage] * 100) + '%';
  }

  private stat(label: string, before: string, after: string, grade?: number) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    const oldValue = document.createElement('span');
    const arrow = document.createElement('span');
    const newValue = document.createElement('b');
    term.textContent = label;
    oldValue.textContent = before;
    arrow.textContent = '→';
    newValue.textContent = after;
    if (grade === undefined) newValue.className = 'weapon-forge-value';
    else {
      oldValue.dataset.grade = String(grade);
      newValue.dataset.grade = String(grade + 1);
    }
    description.append(oldValue, arrow, newValue);
    row.append(term, description);
    return row;
  }

  private fallback(url: string) {
    if (this.disposed || this.finished) return;
    this.plate.classList.add('weapon-forge-fallback');
    const still = document.createElement('img');
    still.className = 'weapon-forge-still';
    still.alt = '';
    if (url) still.src = url;
    still.addEventListener('error', () => still.remove(), { once: true });
    this.plate.prepend(still);
    this.finish();
  }

  private finish() {
    if (this.disposed || this.finished) return;
    this.finished = true;
    clearTimeout(this.timeout);
    cancelAnimationFrame(this.request);
    this.draw?.(forgeDuration);
    this.copy.hidden = false;
    this.card.dataset.animation = 'result';
    this.button.hidden = false;
    this.button.focus({ preventScroll: true });
  }

  private tick = (now: number) => {
    if (this.disposed || this.finished) return;
    const elapsed = (now - this.started) / 1000;
    if (elapsed >= forgeDuration) { this.finish(); return; }
    this.draw?.(elapsed);
    this.request = requestAnimationFrame(this.tick);
  };

  private makeScene(anvil: HTMLImageElement, hammer: HTMLImageElement, panel: HTMLImageElement, weapon: HTMLCanvasElement, data: WeaponUpgradeNotice) {
    const context = this.context!;
    const placement = findPlacement(weapon, WEAPON_ICON_BY_GENERAL[data.generalId]);
    const [impactX, impactY] = placement.contact;
    const effects = createForgeEffects(context, weapon, data.group, data.stage);
    const hammerWidth = 265;
    const hammerHeight = hammerWidth * hammer.naturalHeight / hammer.naturalWidth;
    return (time: number) => {
      context.clearRect(0, 0, width, height);
      const place = ease(time, .12, .94), transfer = ease(time, 3.9, 4.99);
      const exit = ease(time, 3.84, 4.52), ink = ease(time, 5.04, 5.36);
      const shake = forgeHits.reduce((total, hit, i) => {
        const age = time - hit;
        return age < 0 ? total : total + (i + 1) * 2.2 * Math.exp(-age * 21) * Math.sin(age * 86);
      }, 0);
      drawForgeArt(context, anvil, anvil.naturalWidth / anvil.naturalHeight, { x: 480 + shake, y: 328, width: 465, angle: 0 }, 1 - exit);
      forgeHits.forEach((hit, i) => effects.anvilReflection(i, time - hit, impactX + shake, impactY));
      drawForgeArt(context, panel, panel.naturalWidth / panel.naturalHeight, { x: 480, y: 240, width: 804, angle: 0 }, ease(time, 3.96, 4.59));
      const pose = {
        x: mix(mix(287, placement.x, place), 302, transfer) + shake * (1 - exit),
        y: mix(mix(205, placement.y, place) - 48 * Math.sin(Math.PI * place), 240, transfer),
        width: mix(placement.width * (.76 + place * .24), placement.resultWidth, transfer),
        angle: mix(mix(-.18, placement.angle, place), .14, transfer),
      };
      drawForgeArt(context, weapon, weapon.width / weapon.height, pose);
      forgeHits.forEach((hit, i) => effects.weaponReflection(time - hit, impactX + shake, impactY, pose, i));

      if (time >= .96 && time < 3.84) {
        let y = impactY - 63, angle = .30;
        for (let i = 0; i < forgeHits.length; i++) {
          const stop = forgeHits[i], from = stop - [.56, .49, .66][i];
          if (time < from || time > stop + .2) continue;
          const down = range(time, stop - .155, stop) ** 2.7;
          const lift = ease(time, from, stop - .155);
          const rebound = ease(time, stop + .036, stop + .2);
          y = mix(mix(impactY - 63, impactY - 111 - i * 25, lift), impactY, down) - 63 * rebound;
          angle = mix(mix(.3, .68 + i * .12, lift), 0, down) + .30 * rebound;
        }
        context.save();
        context.translate(impactX + shake, y);
        context.rotate(angle);
        context.globalAlpha = ease(time, .96, 1.1) * (1 - ease(time, 3.53, 3.84));
        context.drawImage(hammer, -hammerWidth * .055, -hammerHeight * .985, hammerWidth, hammerHeight);
        context.restore();
      }
      forgeHits.forEach((hit, i) => {
        const age = time - hit;
        effects.impact(i, age, impactX + shake * (1 - ease(age, .03, .16)), impactY, 1 - ease(time, 3.97, 4.48));
      });
      this.card.dataset.strikes = String(forgeHits.filter(hit => time >= hit).length);
      this.card.dataset.animation = time < 3.9 ? 'forging' : ink < 1 ? 'revealing' : 'result';
      this.copy.hidden = ink === 0;
      this.copy.style.opacity = String(ink);
      this.copy.style.transform = 'translateY(' + ((1 - ink) * .7) + 'cqw)';
    };
  }
}
