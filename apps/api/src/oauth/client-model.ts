import mongoose from "mongoose";
import { OauthClientSchema } from "@medialit/models";

export default mongoose.models.OauthClient ||
    mongoose.model("OauthClient", OauthClientSchema);
