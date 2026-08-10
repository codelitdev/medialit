import UserModel from "@/models/user";

type UserWithId = { id: string; email: string; _id: string };

export async function getUserFromSession(
    session: { user?: { email?: string | null } } | null,
): Promise<UserWithId | null> {
    if (!session?.user?.email) return null;
    const dbUser = await UserModel.findOne({
        email: session.user.email,
    }).lean();
    return dbUser as UserWithId | null;
}
