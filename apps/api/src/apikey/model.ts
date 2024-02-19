import mongoose from "mongoose";
import { ApikeySchema } from "@medialit/models";

export default mongoose.models.Apikey || mongoose.model("Apikey", ApikeySchema);
