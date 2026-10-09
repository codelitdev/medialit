"use server";

import { auth } from "@/auth";
import { serverApi } from "@/lib/server-api";

type BillingIntent = "checkout" | "portal" | "cancel" | "resume";

type BillingResult = {
    success: boolean;
    error?: string;
    url?: string;
    /** Set when the API needs a recent sign-in before a billing action. */
    signInUrl?: string;
};

const SIGN_IN_AGAIN = `/login?reauth=1&next=${encodeURIComponent("/account/billing")}`;

/**
 * Billing actions need a single-use token from the API, issued only to a
 * session that signed in recently.
 */
async function postBilling(
    intent: BillingIntent,
    path: string,
    body: Record<string, unknown> = {},
): Promise<BillingResult> {
    try {
        const session = await auth();
        if (!session?.user) {
            throw new Error("Unauthorized");
        }
        const tokenResponse = await serverApi(
            "/api/account/billing/action-token",
            { method: "POST", body: JSON.stringify({ intent }) },
        );
        const tokenData = await tokenResponse.json().catch(() => ({}));
        if (tokenData.error === "recent_authentication_required") {
            return {
                success: false,
                error: "Please sign in again to change your billing.",
                signInUrl: SIGN_IN_AGAIN,
            };
        }
        if (!tokenResponse.ok || typeof tokenData.token !== "string") {
            return {
                success: false,
                error: tokenData.error || "Some error occurred",
            };
        }
        const response = await serverApi(path, {
            method: "POST",
            headers: { "x-medialit-billing-action-token": tokenData.token },
            body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                success: false,
                error: data.error || "Some error occurred",
            };
        }
        const url = data.checkoutUrl || data.portalUrl;
        return { success: true, url };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function startProCheckout(interval: "month" | "year") {
    return postBilling("checkout", "/api/account/billing/checkout", {
        interval,
    });
}

export async function openBillingPortal() {
    return postBilling("portal", "/api/account/billing/portal");
}

export async function cancelSubscription(
    prevState: Record<string, unknown>,
    formData: FormData,
) {
    return postBilling("cancel", "/api/account/billing/cancel");
}

export async function resumeSubscription(
    prevState: Record<string, unknown>,
    formData: FormData,
) {
    return postBilling("resume", "/api/account/billing/resume");
}
