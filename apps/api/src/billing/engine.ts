import { systemClock } from "@codelitdev/billing/core";
import { createDrizzleBillingStore } from "@codelitdev/billing/drizzle";
import {
    createBilling,
    type BillingEngine,
} from "@codelitdev/billing/workflows";
import { getDb } from "@/db";
import * as billingSchema from "@/db/schema/billing.generated";
import logger from "../services/log";
import { medialitBillingAuthorization } from "./authorization";
import { billingCatalogKeys, readCloudBillingConfig } from "./catalog";
import { decryptBillingValue, encryptBillingValue } from "./crypto";
import { createMedialitDodoProvider } from "./dodo";
import { applyMedialitProjectionEffects } from "./product-effects";

const clock = systemClock;

function returnUrlAllowed(url: string): boolean {
    const webOrigin = process.env.WEB_ORIGIN || process.env.WEB_CLIENT;
    if (!webOrigin) return false;
    try {
        return new URL(url).origin === new URL(webOrigin).origin;
    } catch {
        return false;
    }
}

let engine: BillingEngine | undefined;

export function resetBillingEngine(): void {
    engine = undefined;
}

export function getBillingEngine(): BillingEngine | null {
    if (engine) return engine;
    const config = readCloudBillingConfig();
    if (!config) return null;
    const store = createDrizzleBillingStore(getDb() as never, {
        schema: billingSchema,
        clock,
    });
    engine = createBilling({
        database: store,
        providers: [createMedialitDodoProvider()],
        clock,
        authorization: medialitBillingAuthorization,
        sensitiveValues: {
            async encrypt(plaintext: string) {
                return {
                    ciphertext: encryptBillingValue(plaintext),
                    keyVersion: "v1",
                };
            },
            async decrypt(ciphertext: string, _context) {
                return decryptBillingValue(ciphertext);
            },
        },
        hooks: {
            audit: {
                async record(event) {
                    logger.info(
                        { effectId: event.effectId, actor: event.actor.kind },
                        "billing audit",
                    );
                },
            },
            lifecycle: {
                afterProjection: (input) =>
                    applyMedialitProjectionEffects(
                        input,
                        (store.getTransaction() ?? getDb()) as never,
                    ),
            },
        },
        mode: "cloud",
        checkoutProvider: "dodo",
        requestedRevision: config.catalogRevision,
        requiredOfferKeys: [...billingCatalogKeys],
        offers: config.offers,
        returnUrlValidator: returnUrlAllowed,
    });
    return engine;
}
