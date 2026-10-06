"use server";

import { auth } from "@/auth";
import { serverApi } from "@/lib/server-api";

async function postBilling(
    path: string,
    body: Record<string, unknown> = {},
): Promise<{
    success: boolean;
    error?: string;
    url?: string;
}> {
    try {
        const session = await auth();
        if (!session?.user) {
            throw new Error("Unauthorized");
        }
        const response = await serverApi(path, {
            method: "POST",
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
    return postBilling("/api/account/billing/checkout", { interval });
}

export async function openBillingPortal() {
    return postBilling("/api/account/billing/portal");
}

export async function cancelSubscription(
    prevState: Record<string, unknown>,
    formData: FormData,
) {
    return postBilling("/api/account/billing/cancel");
}

export async function resumeSubscription(
    prevState: Record<string, unknown>,
    formData: FormData,
) {
    return postBilling("/api/account/billing/resume");
}
