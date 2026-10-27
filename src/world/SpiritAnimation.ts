import type { SpiritAnimationAsset } from '../data/elementalSpirits';

export interface SpiritFrame { action: number | null; frame: number; }

/** Real-time visual clock, independent of the authoritative game's random stream. */
export class SpiritAnimationClock {
  private startedAt = 0;
  private action: number | null = null;

  constructor(_now: number, private actions: readonly SpiritAnimationAsset[],
    private random: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x1_0000_0000) {
  }

  /** Ignore clicks during an action; never queue or restart the current cycle. */
  trigger(now: number): boolean {
    this.sample(now);
    if (this.action !== null || !this.actions.length) return false;
    this.action = Math.min(this.actions.length - 1, Math.floor(this.random() * this.actions.length));
    this.startedAt = now;
    return true;
  }

  sample(now: number): SpiritFrame {
    if (this.action !== null) {
      const duration = this.actions[this.action].durationsMs.reduce((a, b) => a + b, 0);
      if (now - this.startedAt >= duration) this.action = null;
    }
    if (this.action === null) return { action: null, frame: 0 };
    let elapsed = now - this.startedAt;
    const animation = this.actions[this.action];
    for (let frame = 0; frame < animation.durationsMs.length; frame++) {
      if (elapsed < animation.durationsMs[frame]) return { action: this.action, frame };
      elapsed -= animation.durationsMs[frame];
    }
    return { action: null, frame: 0 };
  }
}

