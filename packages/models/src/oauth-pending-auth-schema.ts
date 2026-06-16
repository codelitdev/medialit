import mongoose from "mongoose";
import { OauthPendingAuth } from "./oauth-pending-auth";

const OauthPendingAuthSchema = new mongoose.Schema<OauthPendingAuth>(
    {
        pendingId: { type: String, required: true, unique: true },
        clientId: { type: String, required: true },
        redirectUri: { type: String, required: true },
        codeChallenge: String,
        codeChallengeMethod: String,
        state: String,
        scope: String,
        email: String,
        otpHash: String,
        otpExpires: Date,
        otpAttempts: { type: Number, default: 0 },
        otpSentAt: Date,
        expiresAt: { type: Date, required: true },
    },
    {
        timestamps: true,
    },
);

OauthPendingAuthSchema.index({ pendingId: 1 }, { unique: true });
OauthPendingAuthSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default OauthPendingAuthSchema;
