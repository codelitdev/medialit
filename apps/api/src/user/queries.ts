import { User } from "@medialit/models";
import { createAccount, findUserByEmail, findUserById } from "@/db";

export async function getUser(id: string): Promise<User | null> {
    return findUserById(id);
}

export async function findByEmail(email: string): Promise<User | null> {
    return findUserByEmail(email);
}

export async function createUser(email: string, name?: string): Promise<User> {
    return createAccount({ email, name });
}
