/**
 * Adopts subscriptions that were started with the payment provider before
 * MediaLit used @codelitdev/billing, so they keep working without the
 * subscriber doing anything. Dry run by default:
 *
 *   bun --filter @medialit/api billing:adopt                      # report only
 *   bun --filter @medialit/api billing:adopt -- --apply --operator you@example.com
 *
 * Only Lemon Squeezy is supported: listing a store's subscriptions is not part
 * of the provider contract.
 */
import { findUserByEmail, closeDb } from "@/db";
import { billingComposition } from "./catalog";
import { getBillingEngine } from "./engine";
import { lemonSqueezyOptionsFromEnv } from "./providers";

export type ProviderSubscription = {
    id: string;
    email: string;
    status: string;
    variantId: string;
    endsAt: Date | null;
};

export type AdoptionPlan =
    | { action: "adopt"; subscription: ProviderSubscription; userId: string }
    | {
          action: "skip";
          subscription: ProviderSubscription;
          reason: "no_account" | "not_in_catalog" | "ended";
      };

const LIVE = new Set(["on_trial", "active", "past_due", "paused"]);

/** Decides what to do with each provider subscription. */
export async function planAdoptions(
    subscriptions: ProviderSubscription[],
    options: {
        catalogProductIds: ReadonlySet<string>;
        findUserIdByEmail: (email: string) => Promise<string | null>;
        now: Date;
    },
): Promise<AdoptionPlan[]> {
    const plans: AdoptionPlan[] = [];
    for (const subscription of subscriptions) {
        const stillPaid =
            LIVE.has(subscription.status) ||
            (subscription.status === "cancelled" &&
                subscription.endsAt !== null &&
                subscription.endsAt > options.now);
        if (!stillPaid) {
            plans.push({ action: "skip", subscription, reason: "ended" });
            continue;
        }
        if (!options.catalogProductIds.has(subscription.variantId)) {
            plans.push({
                action: "skip",
                subscription,
                reason: "not_in_catalog",
            });
            continue;
        }
        const userId = await options.findUserIdByEmail(
            subscription.email.toLowerCase(),
        );
        plans.push(
            userId
                ? { action: "adopt", subscription, userId }
                : { action: "skip", subscription, reason: "no_account" },
        );
    }
    return plans;
}

async function listLemonSqueezySubscriptions(): Promise<
    ProviderSubscription[]
> {
    const { apiKey, storeId } = lemonSqueezyOptionsFromEnv();
    const subscriptions: ProviderSubscription[] = [];
    let url: string | null =
        `https://api.lemonsqueezy.com/v1/subscriptions?filter[store_id]=${encodeURIComponent(storeId)}&page[size]=100`;
    while (url) {
        const response = await fetch(url, {
            headers: {
                Accept: "application/vnd.api+json",
                Authorization: `Bearer ${apiKey}`,
            },
        });
        if (!response.ok) {
            throw new Error(`Lemon Squeezy returned ${response.status}`);
        }
        const page = (await response.json()) as {
            data: Array<{ id: string; attributes: Record<string, unknown> }>;
            links?: { next?: string | null };
        };
        for (const row of page.data) {
            subscriptions.push({
                id: String(row.id),
                email: String(row.attributes.user_email ?? ""),
                status: String(row.attributes.status ?? ""),
                variantId: String(row.attributes.variant_id ?? ""),
                endsAt:
                    typeof row.attributes.ends_at === "string"
                        ? new Date(row.attributes.ends_at)
                        : null,
            });
        }
        url = page.links?.next ?? null;
    }
    return subscriptions;
}

async function main() {
    const apply = process.argv.includes("--apply");
    const operatorIndex = process.argv.indexOf("--operator");
    const operator =
        operatorIndex > 0 ? process.argv[operatorIndex + 1] : undefined;
    if (apply && !operator) {
        throw new Error("Pass --operator <your email> with --apply");
    }
    const composition = billingComposition();
    if (
        composition.deploymentMode !== "cloud" ||
        composition.provider !== "lemonsqueezy"
    ) {
        throw new Error("Set BILLING_PROVIDER=lemonsqueezy and its settings");
    }
    const billing = getBillingEngine();
    await billing.recordRequestedCatalog();
    const verified = await billing.verifyRequestedCatalog();
    if (verified && "verified" in verified && !verified.verified) {
        throw new Error(
            `The catalog does not match Lemon Squeezy: ${JSON.stringify(verified)}`,
        );
    }
    const plans = await planAdoptions(await listLemonSqueezySubscriptions(), {
        catalogProductIds: new Set(
            composition.offers.map((offer) => offer.providerProductId),
        ),
        findUserIdByEmail: async (email) =>
            (await findUserByEmail(email))?.id ?? null,
        now: new Date(),
    });
    for (const plan of plans) {
        const label = `${plan.subscription.id} ${plan.subscription.email} (${plan.subscription.status})`;
        if (plan.action === "skip") {
            console.log(`skip   ${label}: ${plan.reason}`);
            continue;
        }
        if (!apply) {
            console.log(`would adopt ${label} for user ${plan.userId}`);
            continue;
        }
        const user = await findUserByEmail(
            plan.subscription.email.toLowerCase(),
        );
        await billing.adoptProviderSubscription(
            {
                actorId: operator!,
                reason: "Adopt a Lemon Squeezy subscription started before @codelitdev/billing",
            },
            {
                providerName: "lemonsqueezy",
                providerSubscriptionId: plan.subscription.id,
                entity: { kind: "user", id: plan.userId },
                payer: {
                    id: plan.userId,
                    email: user!.email,
                    name: user!.name,
                },
            },
        );
        console.log(`adopted ${label} for user ${plan.userId}`);
    }
    if (!apply) console.log("Dry run. Re-run with --apply --operator <email>.");
}

// Bun sets import.meta.main when this file is run directly.
if ((import.meta as { main?: boolean }).main) {
    main()
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        })
        .finally(() => closeDb());
}
