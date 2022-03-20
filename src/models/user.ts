import mongoose from 'mongoose';

export interface User {
    email: string;
    active: boolean;
    name?: string;
}

const UserSchema = new mongoose.Schema<User>({
    email: { type: String, required: true, unique: true },
    active: { type: Boolean, required: true, default: true },
    name: { type: String, required: false },
}, {
    timestamps: true
});

export default mongoose.models.User || mongoose.model("User", UserSchema);