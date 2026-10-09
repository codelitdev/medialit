import { Router, type Request, type Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { BillingAction } from "@codelitdev/billing/workflows";
import {
    billingErrorResponse,
    handleBillingWebhook,
} from "@codelitdev/platform/billing";
import { findUserById, type AccountUser } from "@/db";
import type { MedialitAuth } from "../auth/better-auth";
import logger from "../services/log";
import {
    billingComposition,
    deploymentMode,
    proOfferKey,
    type BillingInterval,
} from "./catalog";
import { getBillingActionGrants, getBillingEngine } from "./engine";
import { billingPlans } from "./public-plans";

const ACTION_TOKEN_HEADER = "x-medialit-billing-action-token";

type Intent = "checkout" | "portal" | "cancel" | "resume";
const INTENTS: readonly Intent[] = ["checkout", "portal", "cancel", "resume"];

type SessionAccount = {
    user: AccountUser;
    session: { id: string; createdAt: Date };
};

function webOrigin(): string {
    return (
        process.env.WEB_ORIGIN ||
        process.env.WEB_CLIENT ||
        "http://localhost:3000"
    ).replace(/\/$/, "");
}

async function sessionAccount(
    auth: MedialitAuth,
    req: Request,
    res: Response,
): Promise<SessionAccount | null> {
    const current = await auth.auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });
    const user = current?.user?.id
        ? await findUserById(current.user.id)
        : undefined;
    if (!current || !user) {
        res.status(401).json({ error: "Unauthenticated" });
        return null;
    }
    return {
        user,
        session: {
            id: current.session.id,
            createdAt: new Date(current.session.createdAt),
        },
    };
}

function sendBillingError(res: Response, error: unknown) {
    const response = billingErrorResponse(error);
    if (response.status === 502) {
        logger.error({ err: error }, "Billing request failed");
    }
    res.status(response.status).json(response.body);
}

function payer(user: AccountUser) {
    return { id: user.id, email: user.email, name: user.name };
}

function entity(user: AccountUser) {
    return { kind: "user", id: user.id };
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

function configuredBilling() {
    if (billingComposition().deploymentMode !== "cloud") return null;
    return getBillingEngine();
}

/** Resume clears a scheduled cancellation while Pro is still paid for. */
async function resumeAction(user: AccountUser): Promise<BillingAction> {
    const billing = configuredBilling();
    const state = billing ? await billing.commercialState(user.id) : null;
    return state?.activePaidPlan && state.cancelAtPeriodEnd
        ? "cancellation"
        : "checkout";
}

async function actionFor(
    intent: Intent,
    user: AccountUser,
): Promise<BillingAction> {
    if (intent === "portal") return "portal";
    if (intent === "cancel") return "cancellation";
    if (intent === "resume") return resumeAction(user);
    return "checkout";
}

/** The grant for this request, or null after sending a 401. */
function requestGrant(
    req: Request,
    res: Response,
    account: SessionAccount,
    action: BillingAction,
) {
    const token = req.headers[ACTION_TOKEN_HEADER];
    if (typeof token !== "string" || !token) {
        res.status(401).json({ error: "billing_action_token_required" });
        return null;
    }
    return getBillingActionGrants().grant({
        token,
        actorId: account.user.id,
        sessionId: account.session.id,
        action,
        target: entity(account.user),
    });
}

async function beginProCheckout(
    req: Request,
    res: Response,
    account: SessionAccount,
    interval: BillingInterval,
) {
    const billing = configuredBilling();
    if (!billing) {
        res.status(503).json({ error: "billing_not_configured" });
        return;
    }
    const catalog = await billing.publicCatalog();
    if (!catalog?.checkoutAvailable) {
        res.status(409).json({ error: "checkout_unavailable" });
        return;
    }
    const grant = requestGrant(req, res, account, "checkout");
    if (!grant) return;
    const { checkoutUrl } = await billing.startCheckout({
        grant,
        entity: entity(account.user),
        payer: payer(account.user),
        offerKey: proOfferKey(interval),
        catalogRevision: catalog.revision,
        returnUrl: `${webOrigin()}/account/billing`,
        trialDays: 0,
    });
    res.json({ checkoutUrl });
}

export function createBillingRouter(auth: MedialitAuth) {
    const router = Router();

    router.get("/api/account/billing/plans", async (req, res) => {
        const account = await sessionAccount(auth, req, res);
        if (!account) return;
        const billing = configuredBilling();
        try {
            res.json(
                billingPlans(billing ? await billing.publicCatalog() : null),
            );
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    /**
     * Issues a single-use token for one billing action. The session must have
     * signed in recently; otherwise the dashboard asks the person to sign in
     * again.
     */
    router.post("/api/account/billing/action-token", async (req, res) => {
        const account = await sessionAccount(auth, req, res);
        if (!account) return;
        const intent = (req.body as { intent?: unknown } | undefined)?.intent;
        if (!INTENTS.includes(intent as Intent)) {
            res.status(400).json({ error: "billing_action_invalid" });
            return;
        }
        try {
            const issued = await getBillingActionGrants().issue({
                actorId: account.user.id,
                sessionId: account.session.id,
                sessionCreatedAt: account.session.createdAt,
                action: await actionFor(intent as Intent, account.user),
                target: entity(account.user),
            });
            if (!issued.ok) {
                res.status(401).json({ error: issued.error });
                return;
            }
            res.json({
                token: issued.token,
                expiresAt: issued.expiresAt.toISOString(),
            });
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    router.post("/api/account/billing/checkout", async (req, res) => {
        const account = await sessionAccount(auth, req, res);
        if (!account) return;
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
            await beginProCheckout(req, res, account, interval);
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    router.post("/api/account/billing/portal", async (req, res) => {
        const account = await sessionAccount(auth, req, res);
        if (!account) return;
        const billing = configuredBilling();
        if (!billing) {
            res.status(503).json({ error: "billing_not_configured" });
            return;
        }
        const grant = requestGrant(req, res, account, "portal");
        if (!grant) return;
        try {
            const portal = await billing.startPortal({
                grant,
                entity: entity(account.user),
                payer: payer(account.user),
                returnUrl: `${webOrigin()}/account/billing`,
            });
            res.json({ portalUrl: portal.portalUrl });
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    router.post("/api/account/billing/cancel", async (req, res) => {
        const account = await sessionAccount(auth, req, res);
        if (!account) return;
        const billing = configuredBilling();
        if (!billing) {
            res.status(503).json({ error: "billing_not_configured" });
            return;
        }
        const grant = requestGrant(req, res, account, "cancellation");
        if (!grant) return;
        try {
            await billing.cancel({
                grant,
                entity: entity(account.user),
                payer: payer(account.user),
            });
            res.json({ success: true });
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    router.post("/api/account/billing/resume", async (req, res) => {
        const account = await sessionAccount(auth, req, res);
        if (!account) return;
        const requested = readInterval(req.body);
        if (requested === "invalid") {
            res.status(400).json({ error: "Choose monthly or yearly" });
            return;
        }
        const billing = configuredBilling();
        if (!billing) {
            res.status(503).json({ error: "billing_not_configured" });
            return;
        }
        try {
            const state = await billing.commercialState(account.user.id);
            // Still paid for: clear the scheduled cancellation instead of
            // starting a second subscription.
            if (state.activePaidPlan && state.cancelAtPeriodEnd) {
                const grant = requestGrant(req, res, account, "cancellation");
                if (!grant) return;
                await billing.resumeCancellation({
                    grant,
                    entity: entity(account.user),
                    payer: payer(account.user),
                });
                res.json({ success: true });
                return;
            }
            const interval =
                requested === "missing"
                    ? (state.billingInterval ?? "month")
                    : requested;
            await beginProCheckout(req, res, account, interval);
        } catch (error) {
            sendBillingError(res, error);
        }
    });

    return router;
}

export function acceptsWebhookFrom(
    composition: ReturnType<typeof billingComposition>,
    provider: string,
): boolean {
    return (
        composition.deploymentMode === "cloud" &&
        composition.providers.some((name) => name === provider)
    );
}

/**
 * POST /webhooks/billing/:provider. Accepts every connected provider, so one
 * that no longer takes checkouts still reports renewals and cancellations.
 * Any other provider gets 404.
 */
export function billingWebhookRouter() {
    const router = Router();
    router.post("/:provider", async (req, res) => {
        const composition = billingComposition();
        const provider = req.params.provider;
        if (!acceptsWebhookFrom(composition, provider)) {
            res.status(404).json({ accepted: false });
            return;
        }
        const response = await handleBillingWebhook({
            billing: configuredBilling(),
            provider,
            rawBody: (req as Request & { rawBody?: Buffer }).rawBody,
            headers: req.headers,
            workerId: `billing-${process.pid}`,
            onError: (error) =>
                logger.warn(
                    { err: error, provider },
                    "Billing webhook not processed",
                ),
        });
        res.status(response.status).json(response.body);
    });
    return router;
}
