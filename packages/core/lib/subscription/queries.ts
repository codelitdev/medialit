import SubscriptionModel, { Subscription } from './model';

export async function getSubscription(userId: string): Promise<Subscription | null> {
    return await SubscriptionModel.findOne({ userId });
}