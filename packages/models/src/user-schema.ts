import mongoose from "mongoose";
import { User } from "./user";
import { getUniqueId } from "@medialit/utils";

const UserSchema = new mongoose.Schema<User>(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            default: getUniqueId,
        },
        email: { type: String, required: true, unique: true },
        active: { type: Boolean, required: true, default: true },
        name: { type: String, required: false },
        customerId: { type: String, unique: true, sparse: true },
        subscriptionId: { type: String, unique: true, sparse: true },
        subscriptionEndsAfter: { type: Date },
        subscriptionMethod: { type: String, enum: ["stripe", "lemon"] },
        subscriptionStatus: {
            type: String,
            enum: [
                "not-subscribed",
                "subscribed",
                "cancelled",
                "paused",
                "expired",
            ],
            required: true,
            default: "not-subscribed",
        },
    },

    {
        timestamps: true,
    },
);

export default UserSchema;
