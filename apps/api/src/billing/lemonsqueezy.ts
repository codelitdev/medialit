import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { Constants, type SubscriptionStatus } from "@medialit/models";
import { findUserByPublicId, updateSubscription } from "@/db";

type LemonRequest = {
    rawBody?: Buffer;
};

export function lemonWebhookRouter() {
    const router = Router();

    router.get("/", (_req, res) => {
        res.json({ success: true });
    });

    router.post("/", (req, res, next) => {
        handleLemonWebhook(req, res).catch(next);
    });

    return router;
}

async function handleLemonWebhook(req: Request, res: Response) {
    const rawBody = (req as typeof req & LemonRequest).rawBody;
    if (!rawBody || !verifySignature(rawBody, req.get("X-Signature"))) {
        res.status(400).json({ success: false, error: "Invalid signature." });
        return;
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    if (!isSubscriptionEvent(event)) {
        res.json({ success: false });
        return;
    }

    const publicUserId = event?.meta?.custom_data?.userId;
    const user = publicUserId
        ? await findUserByPublicId(String(publicUserId))
        : null;
    if (!user) {
        res.status(404).json({ success: false });
        return;
    }

    const eventName = event?.meta?.event_name;
    const attributes = event?.data?.attributes || {};
    const patch: {
        subscriptionMethod?: "lemon";
        customerId?: string;
        subscriptionId?: string;
        subscriptionStatus: SubscriptionStatus;
        subscriptionEndsAfter?: Date;
    } = {
        subscriptionStatus: subscriptionStatusFromEvent(event),
    };

    if (["subscription_created", "subscription_updated"].includes(eventName)) {
        patch.subscriptionMethod = "lemon";
        patch.customerId =
            attributes.customer_id === undefined ||
            attributes.customer_id === null
                ? undefined
                : String(attributes.customer_id);
        patch.subscriptionId =
            event?.data?.id === undefined || event?.data?.id === null
                ? undefined
                : String(event.data.id);
    }

    if (
        ["subscription_cancelled", "subscription_expired"].includes(eventName)
    ) {
        if (attributes.ends_at) {
            patch.subscriptionEndsAfter = new Date(attributes.ends_at);
        }
    } else if (attributes.renews_at) {
        patch.subscriptionEndsAfter = new Date(attributes.renews_at);
    }

    await updateSubscription(user.userId, patch);
    res.json({ success: true });
}

function subscriptionStatusFromEvent(event: any): SubscriptionStatus {
    switch (event?.data?.attributes?.status) {
        case "active":
        case "on_trail":
            return Constants.SubscriptionStatus.SUBSCRIBED;
        case "cancelled":
            return Constants.SubscriptionStatus.CANCELLED;
        case "expired":
            return Constants.SubscriptionStatus.EXPIRED;
        case "paused":
        case "past_due":
        case "unpaid":
            return Constants.SubscriptionStatus.PAUSED;
        default:
            return Constants.SubscriptionStatus.NOT_SUBSCRIBED;
    }
}

function isSubscriptionEvent(event: any) {
    return (
        [
            "subscription_created",
            "subscription_updated",
            "subscription_cancelled",
            "subscription_resumed",
            "subscription_expired",
            "subscription_paused",
            "subscription_unpaused",
            "subscription_payment_failed",
            "subscription_payment_success",
            "subscription_payment_recovered",
        ].includes(event?.meta?.event_name) &&
        event?.data?.type === "subscriptions"
    );
}

export async function updateLemonSubscription(
    subscriptionId: string | undefined,
    method: "DELETE" | "PATCH",
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    if (!process.env.LEMONSQUEEZY_API_KEY) {
        return { ok: false, status: 500, error: "Lemon API key not found" };
    }
    if (!subscriptionId) {
        return { ok: false, status: 400, error: "No subscription" };
    }
    const response = await fetch(
        `https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`,
        {
            method,
            headers: {
                "Content-Type": "application/vnd.api+json",
                Accept: "application/vnd.api+json",
                Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
            },
            body:
                method === "PATCH"
                    ? JSON.stringify({
                          data: {
                              type: "subscriptions",
                              id: subscriptionId,
                              attributes: { cancelled: false },
                          },
                      })
                    : undefined,
        },
    );
    if (!response.ok) {
        return {
            ok: false,
            status: 502,
            error: "Some error occurred while updating the subscription. Try again in a while.",
        };
    }
    return { ok: true };
}

function verifySignature(body: Buffer, signatureHeader: string | undefined) {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;
    const digest = Buffer.from(
        crypto.createHmac("sha256", secret).update(body).digest("hex"),
        "utf8",
    );
    const signature = Buffer.from(signatureHeader, "utf8");
    if (digest.length !== signature.length) return false;
    return crypto.timingSafeEqual(digest, signature);
}
