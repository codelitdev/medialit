import mongoose from "mongoose";

export interface Plan {
    id: string;
    maxFileSize: number;
    maxStorage: number;
};

const PlanSchema = new mongoose.Schema<Plan>({
    maxFileSize: { type: Number, required: true },
    maxStorage: { type: Number, required: true }
}, {
    timestamps: true
});

export default mongoose.models.Plan || mongoose.model("Plan", PlanSchema);