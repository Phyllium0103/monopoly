type Task = (dt: number, elapsed: number) => boolean;

/** 極簡的補間 / 每幀任務管理 */
export class Animator {
  private tasks: Task[] = [];
  time = 0;

  update(dt: number) {
    this.time += dt;
    this.tasks = this.tasks.filter((t) => !t(dt, this.time));
  }

  /** 每幀呼叫，回傳 true 時移除 */
  add(task: Task) {
    this.tasks.push(task);
  }

  tween(duration: number, fn: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let e = 0;
      this.add((dt) => {
        e += dt;
        const t = Math.min(1, e / duration);
        fn(t);
        if (t >= 1) {
          resolve();
          return true;
        }
        return false;
      });
    });
  }

  wait(seconds: number) {
    return this.tween(seconds, () => {});
  }
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
