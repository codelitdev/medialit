import mongoose from "mongoose";
import { User } from "./user";
import { getUniqueId } from "@medialit/utils";

const UserSchema = new mongoose.Schema<User>(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            default: getUniqueId,
        },
        email: { type: String, required: true, unique: true },
        active: { type: Boolean, required: true, default: true },
        name: { type: String, required: false },
    },
    {
        timestamps: true,
    }
);

export default UserSchema;
