/** One timer per encounter; activity never resets the turn countdown. */
export class AutomaticEncounters {
    private timer?: ReturnType<typeof setTimeout>;
    private disposed = false;

    constructor(
        private readonly shouldRun: () => boolean,
        private readonly intervalMs: () => number,
        private readonly onTurn: () => void
    ) {}

    sync(): void {
        if (this.disposed) { return; }
        if (!this.shouldRun()) {
            if (this.timer) { clearTimeout(this.timer); }
            this.timer = undefined;
            return;
        }
        if (this.timer) { return; }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            if (this.disposed || !this.shouldRun()) { return; }
            this.onTurn();
            this.sync();
        }, Math.max(500, this.intervalMs()));
    }

    dispose(): void {
        this.disposed = true;
        if (this.timer) { clearTimeout(this.timer); }
        this.timer = undefined;
    }
}
