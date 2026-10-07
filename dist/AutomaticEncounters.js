"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomaticEncounters = void 0;
/** One timer per encounter; activity never resets the turn countdown. */
class AutomaticEncounters {
    constructor(shouldRun, intervalMs, onTurn) {
        this.shouldRun = shouldRun;
        this.intervalMs = intervalMs;
        this.onTurn = onTurn;
        this.disposed = false;
    }
    sync() {
        if (this.disposed) {
            return;
        }
        if (!this.shouldRun()) {
            if (this.timer) {
                clearTimeout(this.timer);
            }
            this.timer = undefined;
            return;
        }
        if (this.timer) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            if (this.disposed || !this.shouldRun()) {
                return;
            }
            this.onTurn();
            this.sync();
        }, Math.max(500, this.intervalMs()));
    }
    dispose() {
        this.disposed = true;
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = undefined;
    }
}
exports.AutomaticEncounters = AutomaticEncounters;
//# sourceMappingURL=AutomaticEncounters.js.map