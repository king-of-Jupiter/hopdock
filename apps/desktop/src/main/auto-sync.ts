/** Coalesce rapid edits, serialize runs and retry failures without losing pending work. */
export class AutoSync {
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<{ pushed: number; pulled: number }>;
  private pending = false;
  constructor(private options: {
    ready: () => boolean;
    run: () => Promise<{ pushed: number; pulled: number }>;
    onError: (error: unknown) => void;
    delayMs?: number;
    retryMs?: number;
  }) {}
  schedule(delay = this.options.delayMs ?? 300): void {
    this.pending = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.options.ready()) void this.flush().catch(this.options.onError);
    }, delay);
    this.timer.unref?.();
  }
  flush(): Promise<{ pushed: number; pulled: number }> {
    if (this.running) return this.running;
    clearTimeout(this.timer);
    const work = async () => {
      let result = { pushed: 0, pulled: 0 };
      do {
        this.pending = false;
        const next = await this.options.run();
        result = { pushed: result.pushed + next.pushed, pulled: result.pulled + next.pulled };
      } while (this.pending && this.options.ready());
      return result;
    };
    this.running = work().catch((error) => {
      this.schedule(this.options.retryMs ?? 15000);
      throw error;
    }).finally(() => { this.running = undefined; });
    return this.running;
  }
  dispose(): void { clearTimeout(this.timer); this.pending = false; }
}
