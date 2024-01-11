import { ApikeySchema } from "@medialit/models";
import mongoose from "mongoose";

export default mongoose.models?.Apikey ||
    mongoose.model("Apikey", ApikeySchema);
