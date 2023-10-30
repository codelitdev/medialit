import mongoose from "mongoose";

export interface User {
    _id: mongoose.Types.ObjectId;
    email: string;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new mongoose.Schema<User>(
    {
        email: { type: String, required: true, unique: true },
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
