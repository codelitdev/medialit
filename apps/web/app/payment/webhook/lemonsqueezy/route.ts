import crypto from "node:crypto";
import { LEMONSQUEEZY_WEBHOOK_SECRET } from "@/lib/constants";
import { webServiceApi } from "@/lib/api";
import { Constants, SubscriptionStatus } from "@medialit/models";
import { z } from "zod";

const subscriptionEventSchema = z.object({
    meta: z.object({
        event_name: z.string(),
        custom_data: z.object({ userId: z.string() }),
    }),
    data: z.object({
        id: z.string(),
        type: z.literal("subscriptions"),
        attributes: z.object({
            customer_id: z.union([z.string(), z.number()]),
            status: z.string(),
            ends_at: z.string().nullable().optional(),
            renews_at: z.string().nullable().optional(),
        }),
    }),
});

type SubscriptionEvent = z.infer<typeof subscriptionEventSchema>;

export async function GET() {
    return Response.json({ success: true });
}

export async function POST(request: Request) {
    const rawBody = await request.text();
    verifySignature(rawBody, request.headers.get("X-Signature"));

    const parsedEvent = subscriptionEventSchema.safeParse(JSON.parse(rawBody));
    if (!parsedEvent.success || !isSubscriptionEvent(parsedEvent.data)) {
        return Response.json({ success: false });
    }
    const event = parsedEvent.data;

    const providerDetails = [
        "subscription_created",
        "subscription_updated",
    ].includes(event.meta.event_name)
        ? {
              subscriptionMethod: "lemon" as const,
              customerId: String(event.data.attributes.customer_id),
              subscriptionId: event.data.id,
          }
        : {};

    const dateValue = [
        "subscription_cancelled",
        "subscription_expired",
    ].includes(event.meta.event_name)
        ? event.data.attributes.ends_at
        : event.data.attributes.renews_at;

    const subscriptionUpdate = {
        subscriptionStatus: getSubscriptionStatus(event),
        subscriptionEndsAfter: dateValue ? new Date(dateValue) : null,
        ...providerDetails,
    };
    if (
        subscriptionUpdate.subscriptionEndsAfter &&
        Number.isNaN(subscriptionUpdate.subscriptionEndsAfter.getTime())
    ) {
        return Response.json({ success: false }, { status: 400 });
    }

    try {
        await webServiceApi.updateSubscription({
            userId: event.meta.custom_data.userId,
            ...subscriptionUpdate,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "User not found") {
            return Response.json({ success: false }, { status: 404 });
        }
        throw error;
    }

    return Response.json({ success: true });
}

function getSubscriptionStatus(event: SubscriptionEvent): SubscriptionStatus {
    switch (event.data.attributes.status) {
        case "active":
        case "on_trial":
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

function isSubscriptionEvent(event: SubscriptionEvent) {
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
        event.data.type === "subscriptions"
    );
}

// copied from https://github.com/lmsqueezy/nextjs-billing/blob/134616a4f2210d4a89025d01867c3244c18151af/app/(app)/billing/webhook/route.js#L123C3-L134C4
function verifySignature(body: string, xsignature: string | null) {
    const secret = LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) throw new Error("Lemon Squeezy webhook secret is not set");
    const hmac = crypto.createHmac("sha256", secret);
    const digest = Buffer.from(hmac.update(body).digest("hex"), "utf8");
    const signature = Buffer.from(xsignature || "", "utf8");

    if (
        digest.length !== signature.length ||
        !crypto.timingSafeEqual(
            new Uint8Array(digest),
            new Uint8Array(signature),
        )
    ) {
        throw new Error("Invalid signature.");
    }
}
