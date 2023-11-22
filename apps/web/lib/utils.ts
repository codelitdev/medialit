import Apikey from "@/models/apikey";
import User from "@/models/user";
import { createHash, randomInt } from "crypto";
import { Session } from "next-auth";

export function generateUniquePasscode() {
    return randomInt(100000, 999999);
}

// Inspired from: https://github.com/nextauthjs/next-auth/blob/c4ad77b86762b7fd2e6362d8bf26c5953846774a/packages/next-auth/src/core/lib/utils.ts#L16
export function hashCode(code: number) {
    return createHash("sha256")
        .update(`${code}${process.env.NEXTAUTH_SECRET}`)
        .digest("hex");
}
