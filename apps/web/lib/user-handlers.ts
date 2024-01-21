import UserModel from "@/models/user";
import { User } from "@medialit/models";
import mongoose from "mongoose";
import { Session } from "next-auth";

type UserWithId = User & { _id: mongoose.Types.ObjectId };

export async function getUserFromSession(
    session: Session
): Promise<UserWithId | null> {
    const { user } = session;
    const dbUser: UserWithId | null = await UserModel.findOne<UserWithId>({
        email: user!.email,
    }).lean();

    return dbUser;
}
