"use server";

import { auth } from "@/auth";
import connectToDatabase from "@/lib/connect-db";
import { getUserFromSession } from "@/lib/user-handlers";
import ApikeyModel from "@/models/apikey";
import { Apikey } from "@medialit/models";

export async function updateAppName(
    previousState: Record<string, unknown>,
    formData: FormData
) {
    const newName = formData.get("newName") as string;
    const name = formData.get("name") as string;
    if (!newName) {
        return { success: false, error: "Name is required" };
    }
    if (!name) {
        return { success: false, error: "Bad request" };
    }

    try {
        const session = await auth();
        if (!session || !session.user) {
            throw new Error("Unauthenticated");
        }

        await connectToDatabase();

        const dbUser = await getUserFromSession(session);
        if (!dbUser) {
            throw new Error("User not found");
        }

        await ApikeyModel.updateOne(
            {
                userId: dbUser._id,
                name,
            },
            { $set: { name: newName } }
        );

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
