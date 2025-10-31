import { SubscriptionStatus, User } from "@medialit/models";
import UserModel from "./model";
import mongoose from "mongoose";

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
    return await UserModel.create({
        email,
        active: true,
        name,
        subscriptionStatus,
    });
}
