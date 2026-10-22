/** Occupancy only: never sends game state, nicknames or IP addresses. */
export class RoomPresence {
  private code: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private touch: (code: string) => Promise<void>) {}

  start(code: string) {
    if (this.code === code && this.timer !== null) return;
    void this.stop();
    this.code = code;
    void this.ping();
    this.timer = setInterval(() => void this.ping(), 20_000);
  }

  async ping() {
    const code = this.code;
    if (code) await this.touch(code).catch(() => {});
  }

  async stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const code = this.code;
    this.code = null;
    // Start the five-minute grace period when leaving, rather than at the last beat.
    if (code) await this.touch(code).catch(() => {});
  }
}
