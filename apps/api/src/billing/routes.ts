import { Router, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import {
    BillingConfigurationError,
    BillingWorkflowError,
} from "@codelitdev/billing/core";
import { findUserById, getDb, type AccountUser } from "@/db";
import { billingSubscriptions } from "@/db/schema/billing.generated";
import type { MedialitAuth } from "../auth/better-auth";
import logger from "../services/log";
import { preconsumedGrant } from "./authorization";
import {
    billingComposition,
    deploymentMode,
    proOfferKey,
    type BillingInterval,
} from "./catalog";
import { getBillingEngine } from "./engine";

function webOrigin(): string {
    return (
        process.env.WEB_ORIGIN ||
        process.env.WEB_CLIENT ||
        "http://localhost:3000"
    ).replace(/\/$/, "");
}

function headerMap(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue;
        headers[key.toLowerCase()] = Array.isArray(value)
            ? value.join(",")
            : value;
    }
    return headers;
}

async function sessionUser(
    auth: MedialitAuth,
    req: Request,
    res: Response,
): Promise<AccountUser | null> {
    const session = await auth.auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user?.id) {
        res.status(401).json({ error: "Unauthenticated" });
        return null;
    }
    const user = await findUserById(session.user.id);
    if (!user) {
        res.status(401).json({ error: "Unauthenticated" });
        return null;
    }
    return user;
}

function sendBillingError(res: Response, error: unknown) {
    if (error instanceof BillingWorkflowError) {
        res.status(409).json({ error: error.code });
        return;
    }
    if (error instanceof BillingConfigurationError) {
        res.status(503).json({ error: "Billing is not configured" });
        return;
    }
    logger.error({ err: error }, "Billing request failed");
    res.status(502).json({ error: "Billing request failed" });
}

function payer(user: AccountUser) {
    return { id: user.id, email: user.email, name: user.name };
}

function readInterval(body: unknown): BillingInterval | "missing" | "invalid" {
    if (!body || typeof body !== "object" || !("interval" in body)) {
        return "missing";
    }
    const interval = (body as { interval?: unknown }).interval;
    if (interval === undefined || interval === null || interval === "") {
        return "missing";
    }
    if (interval === "month" || interval === "year") return interval;
    return "invalid";
}

async function storedDodoInterval(userId: string): Promise<BillingInterval> {
    const rows = await getDb()
        .select({ interval: billingSubscriptions.billingInterval })
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.billableEntityId, userId))
        .orderBy(desc(billingSubscriptions.updatedAt))
        .limit(1);
    return rows[0]?.interval === "year" ? "year" : "month";
}

function configuredBilling() {
    if (billingComposition().deploymentMode !== "cloud") return null;
    return getBillingEngine();
}

async function beginProCheckout(
    res: Response,
    user: AccountUser,
    interval: BillingInterval,
) {
    const billing = configuredBilling();
    if (!billing) {
        res.status(503).json({ error: "Billing is not configured" });
        return;
    }
    const catalog = await billing.publicCatalog();
    if (!catalog?.checkoutAvailable) {
        res.status(409).json({ error: "checkout_unavailable" });
        return;
    }
    const { checkoutUrl } = await billing.startCheckout({
        grant: preconsumedGrant("checkout", user.id),
        entity: { kind: "user", id: user.id },
        payer: payer(user),
        offerKey: proOfferKey(interval),
        catalogRevision: catalog.revision,
        returnUrl: `${webOrigin()}/account/billing`,
        trialDays: 0,
    });
    res.json({ checkoutUrl });
}

export function createBillingRouter(auth: MedialitAuth) {
    const router = Router();

    router.post("/api/account/billing/checkout", async (req, res) => {
        const user = await sessionUser(auth, req, res);
        if (!user) return;
        if (deploymentMode() === "oss") {
            res.status(404).json({ error: "Billing is not used in OSS mode" });
            return;
        }
        const interval = readInterval(req.body);
        if (interval === "missing" || interval === "invalid") {
            res.status(400).json({ error: "Choose monthly or yearly" });
            return;
        }
        try {
            await beginProCheckout(res, user, interval);
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    router.post("/api/account/billing/portal", async (req, res) => {
        const user = await sessionUser(auth, req, res);
        if (!user) return;
        const billing = configuredBilling();
        if (!billing) {
            res.status(503).json({ error: "Billing is not configured" });
            return;
        }
        try {
            const portal = await billing.startPortal({
                grant: preconsumedGrant("portal", user.id),
                entity: { kind: "user", id: user.id },
                payer: payer(user),
                returnUrl: `${webOrigin()}/account/billing`,
            });
            res.json({ portalUrl: portal.portalUrl });
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    router.post("/api/account/billing/cancel", async (req, res) => {
        const user = await sessionUser(auth, req, res);
        if (!user) return;
        if (user.subscriptionMethod !== "dodo") {
            res.status(400).json({ error: "No subscription" });
            return;
        }
        const billing = configuredBilling();
        if (!billing) {
            res.status(503).json({ error: "Billing is not configured" });
            return;
        }
        try {
            await billing.cancel({
                grant: preconsumedGrant("cancellation", user.id),
                entity: { kind: "user", id: user.id },
                payer: payer(user),
            });
            res.json({ success: true });
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    router.post("/api/account/billing/resume", async (req, res) => {
        const user = await sessionUser(auth, req, res);
        if (!user) return;
        if (user.subscriptionMethod !== "dodo") {
            res.status(400).json({ error: "No subscription" });
            return;
        }
        const requested = readInterval(req.body);
        if (requested === "invalid") {
            res.status(400).json({ error: "Choose monthly or yearly" });
            return;
        }
        try {
            const interval =
                requested === "missing"
                    ? await storedDodoInterval(user.id)
                    : requested;
            await beginProCheckout(res, user, interval);
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    return router;
}

export function dodoWebhookRouter() {
    const router = Router();
    router.post("/", async (req, res) => {
        const billing = configuredBilling();
        if (!billing) {
            res.status(503).json({ error: "Billing is not configured" });
            return;
        }
        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
        if (!rawBody) {
            res.status(400).json({ accepted: false });
            return;
        }
        try {
            const ingested = await billing.ingestWebhook({
                provider: "dodo",
                raw: {
                    body: rawBody.toString("utf8"),
                    headers: headerMap(req),
                },
            });
            res.status(ingested.duplicate ? 200 : 202).json({ accepted: true });
            void billing
                .runWebhookInboxBatch({ workerId: `billing-${process.pid}` })
                .catch((error) => {
                    logger.error(
                        { err: error },
                        "Dodo webhook projection failed",
                    );
                });
        } catch (error) {
            logger.warn({ err: error }, "Dodo webhook rejected");
            res.status(400).json({ accepted: false });
        }
    });
    return router;
}
