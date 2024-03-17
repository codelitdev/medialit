import mongoose from "mongoose";

const LogSchema = new mongoose.Schema(
    {
        severity: {
            type: String,
            required: true,
            enum: ["error", "info", "warn"],
        },
        message: { type: String, required: true },
        metadata: { type: mongoose.Schema.Types.Mixed },
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.Log || mongoose.model("Log", LogSchema);
