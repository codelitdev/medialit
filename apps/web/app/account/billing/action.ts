"use server";

import { Session } from "next-auth";
import connectToDatabase from "@/lib/connect-db";
import UserModel from "@/models/user";
import { LEMONSQUEEZY_API_KEY } from "@/lib/constants";
import { error } from "@/utils/logger";
import { auth } from "@/auth";

export async function cancelSubscription(
    prevState: Record<string, unknown>,
    formData: FormData
): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        if (!LEMONSQUEEZY_API_KEY) {
            throw new Error("Lemon API key not found");
        }

        const session: Session | null = await auth();
        if (!session || !session.user) {
            throw new Error("Unauthorized");
        }

        await connectToDatabase();

        const user = await UserModel.findOne({
            email: session.user.email,
        });

        if (!user) {
            throw new Error("Unauthorized");
        }

        const response = await fetch(
            `https://api.lemonsqueezy.com/v1/subscriptions/${user.userId}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/vnd.api+json",
                    Accept: "application/vnd.api+json",
                    Authorization: `Bearer ${LEMONSQUEEZY_API_KEY}`,
                },
            }
        );
        if (response.ok) {
            const resp = await response.json();
            return { success: true };
        }

        throw new Error("Some error occurred");
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function resumeSubscription(
    prevState: Record<string, unknown>,
    formData: FormData
): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        if (!LEMONSQUEEZY_API_KEY) {
            throw new Error("Lemon API key not found");
        }

        const session: Session | null = await auth();
        if (!session || !session.user) {
            throw new Error("Unauthorized");
        }

        await connectToDatabase();

        const user = await UserModel.findOne({
            email: session.user.email,
        });

        if (!user) {
            throw new Error("Unauthorized");
        }

        const response = await fetch(
            `https://api.lemonsqueezy.com/v1/subscriptions/${user.userId}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/vnd.api+json",
                    Accept: "application/vnd.api+json",
                    Authorization: `Bearer ${LEMONSQUEEZY_API_KEY}`,
                },
                body: JSON.stringify({
                    data: {
                        type: "subscriptions",
                        id: user.userId,
                        attributes: {
                            cancelled: false,
                        },
                    },
                }),
            }
        );
        const resp = await response.json();

        if (response.ok) {
            return { success: true };
        }

        error(`Error in resuming subscription`, {
            userId: user.subscriptionId,
            apiResponse: resp,
            statusCode: response.status,
        });
        return {
            success: false,
            error: "Some error occurred while resuming subscription. Try again in a while.",
        };
    } catch (err: any) {
        error(`Error in resuming subscription`, err.stack);
        return { success: false, error: err.message };
    }
}
