import UserModel from "@/models/user";
import { User } from "@medialit/models";
import mongoose from "mongoose";

type UserWithId = User & { _id: mongoose.Types.ObjectId };

export async function getUserFromSession(
    session: { user?: { email?: string | null } } | null,
): Promise<UserWithId | null> {
    if (!session || !session.user || !session.user.email) return null;
    const dbUser: UserWithId | null = (await UserModel.findOne<UserWithId>({
        email: session.user.email,
    }).lean()) as UserWithId | null;

    return dbUser;
}
