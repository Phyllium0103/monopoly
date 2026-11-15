import { GOLDEN_CORES, SUCCESS_TEXT } from '../data/breakthroughRules';

const successTitles = new Set(SUCCESS_TEXT.slice(1).flatMap(text => {
  const title = text.split('\n')[0].replace(/[「」。]/g, '');
  return title.includes('xx金丹')
    ? ['金丹', ...Object.values(GOLDEN_CORES).map(core => core.name)].map(core => title.replaceAll('xx金丹', core))
    : [title];
}));

export function isBreakthroughSuccessTitle(title: string): boolean {
  return successTitles.has(title);
}

const poses = [
  [0, 0], [.30, 1], [.50, 2], [.70, 3], [.86, 4], [1.02, 5], [1.18, 6],
  [1.34, 3], [1.50, 4], [1.66, 5], [1.82, 6], [1.98, 3], [2.14, 4],
  [2.30, 5], [2.46, 6], [2.65, 7],
] as const;
const anchors = [.28, .317, .354, .464, .416, .333, .402, .359];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
let sharedWings: HTMLImageElement | undefined;
function wingImage(): HTMLImageElement {
  if (!sharedWings) {
    sharedWings = new Image();
    sharedWings.src = new URL('./breakthrough-flight-wings.webp', import.meta.url).href;
  }
  return sharedWings;
}

/** Realm success only. Owns its animation and resources; the dialog owns confirmation. */
export class BreakthroughFlight {
  private canvas = document.createElement('canvas');
  private surface = document.createElement('div');
  private writing = document.createElement('div');
  private wings = wingImage();
  private context: CanvasRenderingContext2D | null;
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

  constructor(private card: HTMLDivElement, private button: HTMLButtonElement) {
    const heading = card.querySelector('h2')!;
    const text = card.querySelector<HTMLElement>('.dialog-text');
    card.className = 'dialog breakthrough-flight';
    card.style.removeProperty('--breakthrough');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    heading.id = 'breakthrough-flight-title';
    card.setAttribute('aria-labelledby', heading.id);
    heading.className = 'flight-heading';
    this.canvas.className = 'flight-wings';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d');
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
    card.replaceChildren(this.canvas, this.surface);
    card.dataset.animation = 'loading';
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(card);
    this.resizeObserver.observe(this.surface);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.resize();
    this.paint(0);
    Promise.all([this.wings.decode(), paper.decode()]).then(() => {
      if (this.disposed) return;
      this.ready = true;
      if (this.finished || !this.context || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.skip(); this.paint(4); return;
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
    this.paint(4);
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
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.paint(this.finished ? 4 : this.elapsed);
  };

  private paint(t: number): void {
    this.elapsed = t;
    let frame = 0;
    for (const [at, index] of poses) if (t >= at) frame = index;
    const beat = (from: number, to: number) => {
      const x = clamp((t - from) / (to - from));
      return x * x * x * (x * (x * 6 - 15) + 10);
    };
    const lift = .52 * beat(0, 2.65) + .06 * beat(.65, 1.40) + .06 * beat(1.25, 2.05) + .06 * beat(1.85, 2.65);
    const shift = (.70 - lift) * this.height;
    const bob = 1.2 * Math.sin(t * 9.8 - .8) * Math.pow(Math.sin(Math.PI * clamp(t / 2.7)), 2);
    this.surface.style.transform = `translateY(${shift + bob}px)`;
    this.surface.style.opacity = String(clamp(t / .15));
    this.writing.style.opacity = String(clamp((t - 2.25) / .55));
    this.button.style.opacity = String(clamp((t - 2.65) / .35));
    this.card.dataset.frame = String(frame);
    const ctx = this.context;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.ready) return;
    const sw = this.wings.naturalWidth / 2, sh = this.wings.naturalHeight / 4;
    const span = Math.min(this.width * .98, 1020), height = span / 2;
    const rootY = this.surface.offsetTop + this.surface.offsetHeight * .065 + shift + bob;
    ctx.globalAlpha = clamp(t / .12);
    ctx.drawImage(this.wings, frame % 2 * sw, Math.floor(frame / 2) * sh, sw, sh,
      this.width / 2 - span / 2, rootY - height * anchors[frame], span, height);
    ctx.globalAlpha = 1;
  }

  private tick = (now: number) => {
    this.request = 0;
    if (this.disposed || this.finished) return;
    const t = (now - this.started) / 1000 * 1.6;
    if (t >= 3.2) { this.skip(); return; }
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
