import mongoose from "mongoose";

// Kept only for legacy billing integrations; application data now lives in Postgres.
export default mongoose.models.User ||
    mongoose.model("User", new mongoose.Schema({}, { strict: false }));
