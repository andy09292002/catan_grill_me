/**
 * Watches how long frames take to draw. Reports once when the average over a full window of
 * recent frames goes over budget, so the app can ease off the animation on a slow device.
 * A device that is far over budget is caught sooner, after `quickWindow` frames, so it doesn't
 * spend long seconds stuttering before the window fills.
 */
export class FrameBudget {
  private times: number[] = [];
  private tripped = false;

  constructor(
    private readonly budgetMs: number,
    private readonly window: number,
    private readonly quickWindow = Math.min(20, window),
  ) {}

  /** Records one frame's draw time; true the first time the average is over budget. */
  record(ms: number): boolean {
    if (this.tripped) return false;
    this.times.push(ms);
    if (this.times.length > this.window) this.times.shift();
    const n = this.times.length;
    if (n < this.quickWindow) return false;
    const average = this.times.reduce((a, b) => a + b, 0) / n;
    this.tripped = n >= this.window ? average > this.budgetMs : average > this.budgetMs * 2;
    return this.tripped;
  }

  reset() {
    this.times = [];
    this.tripped = false;
  }
}
