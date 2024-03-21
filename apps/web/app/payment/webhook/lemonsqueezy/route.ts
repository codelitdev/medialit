import { LEMONSQUEEZY_WEBHOOK_SECRET } from "@/lib/constants";
import UserModel from "@/models/user";
import { User } from "@medialit/models";

export async function GET() {
    return Response.json({ success: true });
}

export async function POST(request: Request, response: Response) {
    const rawBody = await request.text();
    verifySignature(rawBody, request.headers.get("X-Signature"));

    const event = JSON.parse(rawBody);
    if (!isSubscriptionEvent(event)) {
        return Response.json({ success: false });
    }

    const user: User | null = await UserModel.findOne({
        userId: event.meta.custom_data.userId,
    });

    if (!user) {
        return Response.json({ success: false }, { status: 404 });
    }

    if (
        ["subscription_created", "subscription_updated"].includes(
            event?.meta?.event_name
        )
    ) {
        user.subscriptionMethod = "lemon";
        user.customerId = event.data.attributes.customer_id;
        user.subscriptionId = event.data.id;
    }
    user.subscriptionStatus = getSubscripiontStatus(event);

    if (
        ["subscription_cancelled", "subscription_expired"].includes(
            event?.meta?.event_name
        )
    ) {
        user.subscriptionEndsAfter = new Date(event.data.attributes.ends_at);
    } else {
        user.subscriptionEndsAfter = new Date(event.data.attributes.renews_at);
    }

    await (user as any).save();

    return Response.json({ success: true });
}

function getSubscripiontStatus(event: any) {
    switch (event?.data?.attributes?.status) {
        case "active":
        case "on_trail":
            return "subscribed";
        case "cancelled":
            return "cancelled";
        case "expired":
            return "expired";
        case "paused":
        case "past_due":
        case "unpaid":
            return "paused";
        default:
            return "not-subscribed";
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

// copied from https://github.com/lmsqueezy/nextjs-billing/blob/134616a4f2210d4a89025d01867c3244c18151af/app/(app)/billing/webhook/route.js#L123C3-L134C4
function verifySignature(body: string, xsignature: string | null) {
    const crypto = require("crypto"); //eslint-disable-line @typescript-eslint/no-var-requires

    const secret = LEMONSQUEEZY_WEBHOOK_SECRET;
    const hmac = crypto.createHmac("sha256", secret);
    const digest = Buffer.from(hmac.update(body).digest("hex"), "utf8");
    const signature = Buffer.from(xsignature || "", "utf8");

    if (!crypto.timingSafeEqual(digest, signature)) {
        throw new Error("Invalid signature.");
    }
}
