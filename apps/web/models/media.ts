import mongoose from "mongoose";

// Media is served by the API; this legacy model is not used by the web app.
export default mongoose.models.Media ||
    mongoose.model("Media", new mongoose.Schema({}, { strict: false }));
