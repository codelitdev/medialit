"use server";

import { signOut } from "../../auth";

export async function logOut() {
    await signOut();
}
