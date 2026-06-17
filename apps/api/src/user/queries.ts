import { SubscriptionStatus, User } from "@medialit/models";
import UserModel from "./model";
import mongoose from "mongoose";
import { createApiKey } from "../apikey/queries";

export async function getUser(
    id: string,
): Promise<(User & { _id: mongoose.Types.ObjectId }) | null> {
    return UserModel.findById(id);
}

export async function findByEmail(email: string): Promise<User | null> {
    return await UserModel.findOne({
        email: email,
    });
}

export async function createUser(
    email: string,
    name?: string,
    subscriptionStatus?: SubscriptionStatus,
): Promise<User> {
    const user = await UserModel.create({
        email,
        active: true,
        name,
        subscriptionStatus,
    });

    // Automatically create a default API key for the new user
    await createApiKey(
        String(user.id || (user as any)._id),
        process.env.DEFAULT_APP_NAME || "My Store",
        true,
    );

    return user;
}
