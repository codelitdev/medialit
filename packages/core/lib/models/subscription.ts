import mongoose from 'mongoose';

export interface Subscription {
    userId: typeof mongoose.Types.ObjectId;
    endsAt: Date;
}

const SubscriptionSchema = new mongoose.Schema<Subscription>({
    userId: { type: mongoose.Types.ObjectId, required: true, unique: true },
    endsAt: { type: Date, required: true }
}, {
    timestamps: true
})

export default mongoose.models.Subscription || mongoose.model("Subscription", SubscriptionSchema);