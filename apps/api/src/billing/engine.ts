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
import {
    billingCatalogKeys,
    billingComposition,
    type BillingComposition,
} from "./catalog";
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

export function getBillingEngine(): BillingEngine {
    if (engine) return engine;
    const composition = billingComposition();
    const cloud = composition.deploymentMode === "cloud";
    const store = createDrizzleBillingStore(getDb() as never, {
        schema: billingSchema,
        clock,
    });
    engine = createBilling({
        database: store,
        providers: cloud ? [createMedialitDodoProvider()] : [],
        clock,
        authorization: medialitBillingAuthorization,
        sensitiveValues: cloud
            ? {
                  async encrypt(plaintext: string) {
                      return {
                          ciphertext: encryptBillingValue(plaintext),
                          keyVersion: "v1",
                      };
                  },
                  async decrypt(ciphertext: string, _context) {
                      return decryptBillingValue(ciphertext);
                  },
              }
            : undefined,
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
                  lifecycle: {
                      afterProjection: (input) =>
                          applyMedialitProjectionEffects(
                              input,
                              (store.getTransaction() ?? getDb()) as never,
                          ),
                  },
              }
            : undefined,
        ...billingEngineCheckout(composition),
        returnUrlValidator: cloud ? returnUrlAllowed : undefined,
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
