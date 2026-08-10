import type { WebUser } from "./api";
import { webApi } from "./api";

type UserLookup = () => Promise<WebUser | null>;

export async function getUserFromSession(
    session: {
        user?: { id?: string | null; email?: string | null };
    } | null,
    lookup: UserLookup = webApi.getUser,
): Promise<WebUser | null> {
    if (!session?.user?.id) return null;
    return lookup();
}
