import mongoose from "mongoose";
import { apikeyRestriction } from "./constants";
import { Apikey } from "./api-key";

const ApikeySchema = new mongoose.Schema<Apikey>(
    {
        name: { type: String, required: true },
        key: { type: String, required: true, unique: true },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        restriction: {
            type: String,
            enum: apikeyRestriction,
        },
        httpReferrers: [String],
        ipAddresses: [String],
        custom: String,
        internal: { type: Boolean, default: false },
        deleted: { type: Boolean, default: false },
    },
    {
        timestamps: true,
    }
);

ApikeySchema.index({ name: 1, userId: 1 }, { unique: true });

export default ApikeySchema;
