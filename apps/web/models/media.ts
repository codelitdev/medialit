import { MediaSchema } from "@medialit/models";
import mongoose from "mongoose";

export default mongoose.models?.Media || mongoose.model("Media", MediaSchema);
