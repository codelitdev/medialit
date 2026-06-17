import mongoose from "mongoose";
import { OauthClient } from "./oauth-client";

const OauthClientSchema = new mongoose.Schema<OauthClient>(
    {
        clientId: { type: String, required: true, unique: true },
        clientIdIssuedAt: { type: Number, required: true },
        redirectUris: { type: [String], required: true },
        grantTypes: { type: [String], required: true },
        tokenEndpointAuthMethod: {
            type: String,
            enum: ["none"],
            required: true,
            default: "none",
        },
        clientName: String,
        scope: String,
    },
    {
        timestamps: true,
    },
);

OauthClientSchema.index({ clientId: 1 }, { unique: true });
OauthClientSchema.index({ createdAt: 1 });

export default OauthClientSchema;
