import { systemClock } from "@codelitdev/billing/core";
import { createDrizzleBillingStore } from "@codelitdev/billing/drizzle";
import {
    createBilling,
    type BillingEngine,
} from "@codelitdev/billing/workflows";
import {
    aesGcmSensitiveValuesFromEnv,
    createBillingActionGrants,
    createReturnUrlValidator,
} from "@codelitdev/platform/billing";
import { drizzleVerificationGrantStore } from "@codelitdev/platform/billing/drizzle";
import { getDb } from "@/db";
import { verification } from "@/db/schema/auth.generated";
import * as billingSchema from "@/db/schema/billing.generated";
import logger from "../services/log";
import {
    billingCatalogKeys,
    billingComposition,
    type BillingComposition,
} from "./catalog";
import { createMedialitDodoProvider } from "./dodo";

const clock = systemClock;

let engine: BillingEngine | undefined;
let grants: ReturnType<typeof createBillingActionGrants> | undefined;

export function resetBillingEngine(): void {
    engine = undefined;
    grants = undefined;
}

/**
 * Single-use billing action grants, stored in Better Auth's `verification`
 * table. A token is issued only to a session that signed in within
 * BILLING_RECENT_AUTH_MAX_AGE_SECONDS (default 15 minutes).
 */
export function getBillingActionGrants() {
    if (grants) return grants;
    const maxAgeSeconds = Number(
        process.env.BILLING_RECENT_AUTH_MAX_AGE_SECONDS ?? 900,
    );
    grants = createBillingActionGrants({
        store: drizzleVerificationGrantStore(getDb() as never, verification),
        clock,
        recentAuthMaxAgeMs:
            Number.isSafeInteger(maxAgeSeconds) && maxAgeSeconds > 0
                ? maxAgeSeconds * 1000
                : 900 * 1000,
    });
    return grants;
}

export function getBillingEngine(): BillingEngine {
    if (engine) return engine;
    const composition = billingComposition();
    const cloud = composition.deploymentMode === "cloud";
    const store = createDrizzleBillingStore(getDb() as never, {
        schema: billingSchema,
        clock,
    });
    const webOrigin = process.env.WEB_ORIGIN || process.env.WEB_CLIENT;
    engine = createBilling({
        database: store,
        providers: cloud ? [createMedialitDodoProvider()] : [],
        clock,
        authorization: getBillingActionGrants().authorization,
        sensitiveValues: cloud ? aesGcmSensitiveValuesFromEnv() : undefined,
        hooks: cloud
            ? {
                  audit: {
                      async record(event) {
                          logger.info(
                              {
                                  effectId: event.effectId,
                                  actor: event.actor.kind,
                              },
                              "billing audit",
                          );
                      },
                  },
              }
            : undefined,
        ...billingEngineCheckout(composition),
        returnUrlValidator: cloud
            ? createReturnUrlValidator(webOrigin ? [webOrigin] : [])
            : undefined,
    });
    return engine;
}

export function billingEngineCheckout(composition: BillingComposition) {
    if (composition.deploymentMode === "oss") {
        return {
            mode: "oss" as const,
            checkoutProvider: "",
            requestedRevision: null,
            requiredOfferKeys: [] as string[],
            offers: [],
        };
    }
    return {
        mode: "cloud" as const,
        checkoutProvider: "dodo",
        requestedRevision: composition.catalogRevision,
        requiredOfferKeys: [...billingCatalogKeys],
        offers: composition.offers,
    };
}
