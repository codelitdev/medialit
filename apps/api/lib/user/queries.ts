import { User } from "@medialit/models";
import UserModel from "./model";

export async function getUser(id: string): Promise<User | null> {
    return UserModel.findById(id);
}

export async function findByEmail(email: string): Promise<User | null> {
    return await UserModel.findOne({
        email: email,
    });
}

export async function createUser(email: string): Promise<User> {
    return await UserModel.create({
        email,
        active: true,
    });
}
