import mongoose from "mongoose";
import { User } from "./user";
import ApikeySchema from "./api-key-schema";
import { getUniqueId } from "@medialit/utils";
import { internalApikeyName } from "./constants";

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

UserSchema.post("save", async function (doc, next) {
    if (doc.isNew) {
        await mongoose.model("Apikey", ApikeySchema).create({
            name: internalApikeyName,
            key: getUniqueId(),
            userId: doc.userId,
            internal: true,
        });
    }
    next();
});

export default UserSchema;
