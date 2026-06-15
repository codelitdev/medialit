import mongoose from "mongoose";
import { apikeyRestriction } from "./constants";
import { Apikey } from "./api-key";
import { getUniqueId } from "@medialit/utils";

const ApikeySchema = new mongoose.Schema<Apikey>(
    {
        keyId: {
            type: String,
            required: true,
            unique: true,
            default: getUniqueId,
        },
        name: { type: String, required: true },
        key: { type: String, required: true, unique: true },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        restriction: {
            type: String,
            enum: apikeyRestriction,
        },
        httpReferrers: [String],
        ipAddresses: [String],
        deleted: { type: Boolean, default: false },
        default: { type: Boolean, default: false },
    },
    {
        timestamps: true,
    },
);

ApikeySchema.index({ name: 1, userId: 1 }, { unique: true });
ApikeySchema.index(
    { userId: 1, default: 1 },
    {
        unique: true,
        partialFilterExpression: { default: true, deleted: false },
    },
);

export default ApikeySchema;
