import mongoose from "mongoose";
import { OauthRevokedToken } from "./oauth-revoked-token";

const OauthRevokedTokenSchema = new mongoose.Schema<OauthRevokedToken>(
    {
        jti: { type: String, required: true, unique: true },
        tokenType: {
            type: String,
            enum: ["refresh_token"],
            required: true,
            default: "refresh_token",
        },
        userId: { type: String, required: true },
        clientId: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        revokedAt: { type: Date, required: true, default: Date.now },
    },
    {
        timestamps: true,
    },
);

OauthRevokedTokenSchema.index({ jti: 1 }, { unique: true });
OauthRevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default OauthRevokedTokenSchema;
