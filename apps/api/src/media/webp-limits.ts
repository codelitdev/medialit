import { imageLimitsFromEnv, Slots, type ImageLimits } from "@medialit/images";

/** The image limits from the `WEBP_*` variables (see `.env.example`). Read on
 * each call, so tests can change them. */
export function webpLimits(): ImageLimits {
    return imageLimitsFromEnv(process.env);
}

let slots: Slots | undefined;

/**
 * This API process's WebP conversion slots, `WEBP_CONCURRENCY` of them.
 * Every seal shares them, so one tenant's flood of seals can cost other
 * tenants their WebP but never their seal.
 */
export function webpSlots(): Slots {
    const size = webpLimits().concurrency;
    if (!slots || (slots.size !== size && slots.inUse === 0)) {
        slots = new Slots(size);
    }
    return slots;
}
