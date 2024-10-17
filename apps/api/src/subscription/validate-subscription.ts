import { getUser } from "../user/queries";

export async function validateSubscription(userId: string) {
    const user = await getUser(userId);
    return user && isDateInFuture(user.subscriptionEndsAfter);
}

function isDateInFuture(dateStr: Date): boolean {
    return new Date(dateStr).getTime() > new Date().getTime();
}
