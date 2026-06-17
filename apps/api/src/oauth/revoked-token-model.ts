import mongoose from "mongoose";
import { OauthRevokedTokenSchema } from "@medialit/models";

export default mongoose.models.OauthRevokedToken ||
    mongoose.model("OauthRevokedToken", OauthRevokedTokenSchema);
