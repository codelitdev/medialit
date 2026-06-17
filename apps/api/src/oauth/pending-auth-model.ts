import mongoose from "mongoose";
import { OauthPendingAuthSchema } from "@medialit/models";

export default mongoose.models.OauthPendingAuth ||
    mongoose.model("OauthPendingAuth", OauthPendingAuthSchema);
