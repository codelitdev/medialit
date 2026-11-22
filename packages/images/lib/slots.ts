/** Gives back a slot taken from `Slots`. Calling it twice does nothing. */
export type ReleaseSlot = () => void;

/**
 * A counting semaphore for work that must not run too many at once in one
 * process, such as image conversions. Waiters are served in arrival order.
 */
export class Slots {
    private active = 0;
    private readonly waiters: Array<(release: ReleaseSlot) => void> = [];

    constructor(readonly size: number) {
        if (!Number.isInteger(size) || size < 1) {
            throw new Error("Slots needs a size of at least 1");
        }
    }

    /** Slots in use now. */
    get inUse(): number {
        return this.active;
    }

    /** Callers waiting for a slot now. */
    get waiting(): number {
        return this.waiters.length;
    }

    /**
     * Takes a slot, waiting up to `waitMs` for one to free up. Resolves to a
     * release function, or null if no slot freed up in time or `signal`
     * fired first.
     */
    acquire(waitMs: number, signal?: AbortSignal): Promise<ReleaseSlot | null> {
        if (signal?.aborted) return Promise.resolve(null);
        if (this.active < this.size) {
            this.active++;
            return Promise.resolve(this.releaser());
        }
        if (waitMs <= 0) return Promise.resolve(null);
        return new Promise((resolve) => {
            const waiter = (release: ReleaseSlot) => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", giveUp);
                resolve(release);
            };
            const giveUp = () => {
                const index = this.waiters.indexOf(waiter);
                if (index >= 0) this.waiters.splice(index, 1);
                clearTimeout(timer);
                signal?.removeEventListener("abort", giveUp);
                resolve(null);
            };
            const timer = setTimeout(giveUp, waitMs);
            signal?.addEventListener("abort", giveUp, { once: true });
            this.waiters.push(waiter);
        });
    }

    private releaser(): ReleaseSlot {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const next = this.waiters.shift();
            if (next) {
                // The slot passes straight to the next waiter.
                next(this.releaser());
            } else {
                this.active--;
            }
        };
    }
}
