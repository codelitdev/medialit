import mongoose from "mongoose";
import {
    PRESIGNED_URL_LENGTH,
    PRESIGNED_URL_VALIDITY_MINUTES,
} from "../config/constants";
import { getUniqueId } from "@medialit/utils";

export interface PreSignedUrl {
    id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    apikey: string;
    signature: string;
    validTill: Date;
    group?: string;
}

const PreSignedUrlSchema = new mongoose.Schema<PreSignedUrl>(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        apikey: { type: String, required: true },
        signature: {
            type: String,
            required: true,
            default: () => getUniqueId(PRESIGNED_URL_LENGTH),
        },
        validTill: {
            type: Date,
            required: true,
            default: () =>
                new Date(
                    new Date().getTime() +
                        PRESIGNED_URL_VALIDITY_MINUTES * 60000
                ),
        },
        group: String,
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.PreSignedUrl ||
    mongoose.model("PreSignedUrl", PreSignedUrlSchema);
