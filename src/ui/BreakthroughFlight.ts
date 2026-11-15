import { BREAKTHROUGH_TITLES, GOLDEN_CORES, SUCCESS_TEXT } from '../data/breakthroughRules';

const successTitles = new Set(SUCCESS_TEXT.slice(1).flatMap(text => {
  const title = text.split('\n')[0].replace(/[「」。]/g, '');
  return title.includes('xx金丹')
    ? ['金丹', ...Object.values(GOLDEN_CORES).map(core => core.name)].map(core => title.replaceAll('xx金丹', core))
    : [title];
}));

export function isBreakthroughSuccessTitle(title: string): boolean {
  return successTitles.has(title);
}

export function isBreakthroughFailure(title: string, text: string): boolean {
  return title === '突破失敗' || BREAKTHROUGH_TITLES.some(value => value === title)
    && /血量歸零，身死道消|保命效果生效，境界保留|損失25%修為與最大血量的50%/.test(text);
}

const poses = [
  [0, 0], [.30, 1], [.50, 2], [.70, 3], [.86, 4], [1.02, 5], [1.18, 6],
  [1.34, 3], [1.50, 4], [1.66, 5], [1.82, 6], [1.98, 3], [2.14, 4],
  [2.30, 5], [2.46, 6], [2.65, 7],
] as const;
const anchors = [.28, .317, .354, .464, .416, .333, .402, .359];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
let sharedWings: [HTMLImageElement, HTMLImageElement] | undefined;
function wingImages(): [HTMLImageElement, HTMLImageElement] {
  if (!sharedWings) {
    sharedWings = [new Image(), new Image()];
    sharedWings[0].src = new URL('./breakthrough-wings-rear.webp', import.meta.url).href;
    sharedWings[1].src = new URL('./breakthrough-wings-front.webp', import.meta.url).href;
  }
  return sharedWings;
}

/** Owns realm outcome animation and resources; the dialog owns confirmation. */
export class BreakthroughFlight {
  private canvas = document.createElement('canvas');
  private forewing = document.createElement('canvas');
  private surface = document.createElement('div');
  private writing = document.createElement('div');
  private wings = wingImages()[0];
  private foldedWings = wingImages()[1];
  private broken: HTMLImageElement[] = [];
  private fragmentLayers: HTMLCanvasElement[] = [];
  private fractureWriting: HTMLElement | null = null;
  private context: CanvasRenderingContext2D | null;
  private frontContext: CanvasRenderingContext2D | null;
  private resizeObserver: ResizeObserver;
  private request = 0;
  private started = 0;
  private hiddenAt = 0;
  private elapsed = 0;
  private width = 0;
  private height = 0;
  private finished = false;
  private disposed = false;
  private ready = false;

  constructor(private card: HTMLDivElement, private button: HTMLButtonElement, private failure = false) {
    const heading = card.querySelector('h2')!;
    const text = card.querySelector<HTMLElement>('.dialog-text');
    card.className = 'dialog breakthrough-flight';
    card.classList.toggle('flight-failure', failure);
    card.style.removeProperty('--breakthrough');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    heading.id = 'breakthrough-flight-title';
    card.setAttribute('aria-labelledby', heading.id);
    heading.className = 'flight-heading';
    this.canvas.className = 'flight-wings';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d');
    this.forewing.className = 'flight-wing-front';
    this.forewing.setAttribute('aria-hidden', 'true');
    this.frontContext = this.forewing.getContext('2d');
    this.surface.className = 'flight-panel';
    const paper = document.createElement('img');
    paper.className = 'flight-paper';
    paper.alt = '';
    paper.src = new URL('./breakthrough-flight-panel.webp', import.meta.url).href;
    this.writing.className = 'flight-copy';
    this.writing.append(heading);
    if (text) { text.className = 'flight-body'; this.writing.append(text); }
    button.className = 'flight-confirm';
    button.setAttribute('aria-disabled', 'true');
    this.surface.append(paper, this.writing, button);
    card.replaceChildren(this.canvas, this.surface, this.forewing);
    const images = [this.wings.decode(), this.foldedWings.decode(), paper.decode()];
    if (failure) {
      this.broken = [new Image(), new Image()];
      this.broken[0].src = new URL('./breakthrough-flight-left.webp', import.meta.url).href;
      this.broken[1].src = new URL('./breakthrough-flight-right.webp', import.meta.url).href;
      images.push(...this.broken.map(image => image.decode()));
      const result = document.createElement('div');
      result.className = 'failure-result';
      if (heading.textContent !== '突破失敗') {
        const status = document.createElement('small');
        status.className = 'failure-status'; status.textContent = '突破失敗';
        this.writing.prepend(status);
      }
      this.fractureWriting = this.writing.cloneNode(true) as HTMLElement;
      this.fractureWriting.removeAttribute('id');
      this.fractureWriting.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      this.fractureWriting.querySelector('.failure-status')?.remove();
      const target = BREAKTHROUGH_TITLES.findIndex(title => title === heading.textContent);
      const inscription = SUCCESS_TEXT[target > 0 ? target : text?.textContent?.includes('25%') ? 2 : 1].replaceAll('xx金丹', '金丹').split('\n');
      this.fractureWriting.querySelector('.flight-heading')!.textContent = inscription[0].replace(/[「」。]/g, '');
      this.fractureWriting.querySelector('.flight-body')!.textContent = inscription.slice(1).join('\n');
      this.fractureWriting.classList.add('fracture-copy');
      this.fractureWriting.style.opacity = '0';
      this.fractureWriting.setAttribute('aria-hidden', 'true');
      this.surface.append(this.fractureWriting);
      result.append(this.writing, button); card.append(result);
    }
    card.dataset.animation = 'loading';
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(card);
    this.resizeObserver.observe(this.surface);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.resize();
    this.paint(0);
    Promise.all(images).then(() => {
      if (this.disposed) return;
      this.ready = true;
      if (this.finished || !this.context || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.skip(); this.paint(this.failure ? 5 : 4); return;
      }
      this.started = performance.now();
      if (document.hidden) this.hiddenAt = this.started;
      card.dataset.animation = 'playing';
      if (!document.hidden) this.request = requestAnimationFrame(this.tick);
    }).catch(() => { if (!this.disposed) this.skip(); });
  }

  /** True means this input was consumed to reveal the result, not confirm it. */
  skip(): boolean {
    if (this.finished || this.disposed) return false;
    this.finished = true;
    cancelAnimationFrame(this.request);
    this.request = 0;
    this.paint(this.failure ? 5 : 4);
    this.card.dataset.animation = 'complete';
    this.button.removeAttribute('aria-disabled');
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.request);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
  }

  private resize = () => {
    if (this.disposed) return;
    this.width = this.card.clientWidth;
    this.height = this.card.clientHeight;
    this.surface.style.top = `${(this.height - this.surface.offsetHeight) / 2}px`;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    for (const canvas of [this.canvas, this.forewing]) {
      canvas.width = Math.round(this.width * ratio);
      canvas.height = Math.round(this.height * ratio);
    }
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.frontContext?.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.fragmentLayers = [];
    this.paint(this.finished ? this.failure ? 5 : 4 : this.elapsed);
  };

  private paint(t: number): void {
    this.elapsed = t;
    const flightTime = this.failure ? Math.min(t, 2.1) : t;
    let frame = 0;
    for (const [at, index] of poses) if (flightTime >= at) frame = index;
    const beat = (from: number, to: number) => {
      const x = clamp((flightTime - from) / (to - from));
      return x * x * x * (x * (x * 6 - 15) + 10);
    };
    const lift = .52 * beat(0, 2.65) + .06 * beat(.65, 1.40) + .06 * beat(1.25, 2.05) + .06 * beat(1.85, 2.65);
    let shift = (.70 - lift) * this.height;
    const bob = this.failure && t > 2.1 ? 0 : 1.2 * Math.sin(t * 9.8 - .8) * Math.pow(Math.sin(Math.PI * clamp(t / 2.7)), 2);
    const fall = this.failure ? clamp((t - 2.25) / .85) : 0;
    const rotation = this.failure && t > 2.1 ? Math.sin((t - 2.1) * 20) * .045 * (1 - fall) + fall * .09 : 0;
    if (this.failure) {
      this.card.dataset.phase = t < 2.1 ? 'ascent' : t < 2.25 ? 'stall' : t < 3.1 ? 'fall' : t < 4.2 ? 'impact' : 'settled';
      if (t > 2.25) {
        const floorShift = this.height - this.surface.offsetTop - this.surface.offsetHeight + this.surface.offsetHeight * .035 - 2;
        shift += (floorShift - shift) * Math.pow(fall, 2.25);
      }
      if (t > 2.1) frame = t < 2.4 ? 5 : 0;
    }
    this.surface.style.transform = `translateY(${shift + bob}px) rotate(${rotation}rad)`;
    this.surface.style.opacity = String(this.failure && t >= 3.1 ? 0 : clamp(t / .15));
    const resultOpacity = clamp((t - 4.2) / .4);
    if (this.failure) {
      const result = this.writing.parentElement!;
      result.style.opacity = String(resultOpacity);
      result.style.visibility = resultOpacity > 0 ? 'visible' : 'hidden';
    }
    this.writing.style.opacity = String(this.failure ? 1 : clamp((t - 2.25) / .55));
    this.button.style.opacity = String(this.failure ? 1 : clamp((t - 2.65) / .35));
    this.card.dataset.frame = String(frame);
    // Registered image layers: rear shoulder -> plaque -> entire folded outer arms.
    this.canvas.style.zIndex = this.failure && t >= 3.1 ? '2' : '0';
    this.surface.style.zIndex = '1';
    this.card.dataset.wingLayer = 'split';
    const ctx = this.context;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    this.frontContext?.clearRect(0, 0, this.width, this.height);
    if (!this.ready) return;
    if (this.failure && t >= 3.1) { this.paintImpact(t - 3.1); return; }
    const sw = this.wings.naturalWidth / 2, sh = this.wings.naturalHeight / 4;
    const span = Math.min(this.width * .98, 1020), height = span / 2;
    const rootY = this.surface.offsetTop + this.surface.offsetHeight * .065 + shift + bob;
    ctx.save();
    ctx.translate(this.width / 2, this.surface.offsetTop + shift + bob + this.surface.offsetHeight / 2);
    ctx.rotate(rotation);
    ctx.translate(-this.width / 2, -this.surface.offsetTop - shift - bob - this.surface.offsetHeight / 2);
    ctx.globalAlpha = clamp(t / .12) * (this.failure ? 1 - clamp((t - 2.25) / .85) : 1);
    ctx.drawImage(this.wings, frame % 2 * sw, Math.floor(frame / 2) * sh, sw, sh,
      this.width / 2 - span / 2, rootY - height * anchors[frame], span, height);
    ctx.restore();
    if (this.frontContext) {
      const front = this.frontContext;
      const x = this.width / 2 - span / 2, y = rootY - height * anchors[frame];
      const w = this.surface.offsetWidth, h = this.surface.offsetHeight;
      const top = this.surface.offsetTop + shift + bob;
      front.save();
      front.translate(this.width / 2, top + h / 2); front.rotate(rotation);
      front.translate(-this.width / 2, -top - h / 2);
      front.globalAlpha = clamp(t / .12) * (this.failure ? 1 - clamp((t - 2.25) / .85) : 1);
      front.drawImage(this.foldedWings, frame % 2 * sw, Math.floor(frame / 2) * sh, sw, sh, x, y, span, height);
      // No foreground feather pixel can cover the central round medallion, at any pose.
      front.globalAlpha = 1;
      front.globalCompositeOperation = 'destination-out'; front.beginPath();
      front.ellipse(this.width / 2, top + h * .113, w * .075, h * .10, 0, 0, Math.PI * 2);
      front.fill(); front.restore();
    }
  }

  private paintImpact(elapsed: number): void {
    const ctx = this.context;
    if (!ctx || this.broken.length !== 2) return;
    const q = clamp(elapsed / 1.1), ease = 1 - Math.pow(1 - q, 3);
    const w = this.surface.offsetWidth, h = this.surface.offsetHeight, left = this.surface.offsetLeft;
    if (!this.fragmentLayers.length) this.buildFragmentLayers(w, h);
    for (const side of [-1, 1]) {
      const angle = side * .16 * ease;
      const halfExtent = h / 2 * Math.cos(angle) + w / 4 * Math.abs(Math.sin(angle));
      const bounce = q < 1 ? Math.abs(Math.sin(q * Math.PI * 2.5)) * 14 * Math.exp(-q * 4) : 0;
      const centerX = left + w * (side < 0 ? .25 : .75) + side * w * .14 * ease;
      const centerY = this.height - halfExtent + h * .035 - 2 - bounce;
      ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(angle);
      ctx.translate(-w * (side < 0 ? .25 : .75), -h / 2);
      ctx.drawImage(this.broken[side < 0 ? 0 : 1], 0, 0, w, h);
      ctx.globalAlpha = clamp(elapsed / .30);
      ctx.drawImage(this.fragmentLayers[side < 0 ? 0 : 1], 0, 0, w, h);
      ctx.restore();
    }
    if (q < .6) {
      ctx.save(); ctx.globalAlpha = (1 - q / .6) * .30;
      ctx.fillStyle = '#c9af84'; ctx.beginPath();
      ctx.ellipse(this.width / 2, this.height - 5, w * (.30 + q * .30), 4 + q * 10, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.restore();
    }
    this.card.dataset.pieces = '2';
    this.card.dataset.fracturedText = 'success';
    this.card.dataset.inscriptionOpacity = String(clamp(elapsed / .30));
  }

  private buildFragmentLayers(w: number, h: number): void {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.fragmentLayers = this.broken.map(image => {
      const layer = document.createElement('canvas');
      layer.width = Math.round(w * ratio); layer.height = Math.round(h * ratio);
      const ctx = layer.getContext('2d')!; ctx.scale(ratio, ratio);
      this.paintFracturedText(ctx, w, h);
      // Real fragment alpha, including its exposed jagged edge, defines the broken letters.
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(image, 0, 0, w, h);
      return layer;
    });
  }

  /** Draw the same inscription into both complementary clips so letters break with the plaque. */
  private paintFracturedText(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.fractureWriting) return;
    const heading = this.fractureWriting.querySelector<HTMLElement>('.flight-heading')!;
    const body = this.fractureWriting.querySelector<HTMLElement>('.flight-body');
    const titleStyle = getComputedStyle(heading), bodyStyle = body ? getComputedStyle(body) : titleStyle;
    const lines = (text: string, font: string, max: number): string[] => {
      ctx.font = font;
      const output: string[] = []; let line = '';
      for (const letter of text) {
        if (letter === '\n' || line && ctx.measureText(line + letter).width > max) { output.push(line); line = letter === '\n' ? '' : letter; }
        else line += letter;
      }
      if (line) output.push(line); return output;
    };
    const titleFont = `${titleStyle.fontWeight} ${titleStyle.fontSize} ${titleStyle.fontFamily}`;
    const bodyFont = `${bodyStyle.fontWeight} ${bodyStyle.fontSize} ${bodyStyle.fontFamily}`;
    const titleLines = lines(heading.textContent ?? '', titleFont, w * .75);
    const bodyLines = lines(body?.textContent ?? '', bodyFont, w * .75);
    const titleHeight = parseFloat(titleStyle.lineHeight), bodyHeight = parseFloat(bodyStyle.lineHeight);
    let y = h * .51 - (titleLines.length * titleHeight + 28 + bodyLines.length * bodyHeight) / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#6b271d'; ctx.font = titleFont;
    for (const line of titleLines) { ctx.fillText(line, w / 2, y + titleHeight / 2); y += titleHeight; }
    y += 28; ctx.fillStyle = '#3d2a20'; ctx.font = bodyFont;
    for (const line of bodyLines) { ctx.fillText(line, w / 2, y + bodyHeight / 2); y += bodyHeight; }
  }

  private tick = (now: number) => {
    this.request = 0;
    if (this.disposed || this.finished) return;
    const t = (now - this.started) / 1000 * 1.6;
    if (t >= (this.failure ? 4.7 : 3.2)) { this.skip(); return; }
    this.paint(t);
    this.request = requestAnimationFrame(this.tick);
  };

  private visibilityChanged = () => {
    if (this.disposed || this.finished || !this.ready) return;
    if (document.hidden) {
      this.hiddenAt = performance.now();
      cancelAnimationFrame(this.request); this.request = 0;
    } else {
      if (this.hiddenAt) this.started += performance.now() - this.hiddenAt;
      this.hiddenAt = 0;
      if (!this.request) this.request = requestAnimationFrame(this.tick);
    }
  };
}
