import mongoose from "mongoose";
import { UserSchema } from "@medialit/models";

export default mongoose.models?.User || mongoose.model("User", UserSchema);
