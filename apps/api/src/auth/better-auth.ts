import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";
import * as authSchema from "@/db/schema/auth.generated";
import { AUTH_BASE_PATH, authUrls, medialitAuthOptions } from "./options";

export function createMedialitAuth(input: {
    publicApiUrl: string;
    secret: string;
    webOrigin?: string;
}) {
    if (input.secret.length < 32) {
        throw new Error("Auth secret must be at least 32 characters");
    }
    const urls = authUrls(input.publicApiUrl, input.webOrigin);
    const auth = betterAuth(
        medialitAuthOptions({
            publicApiUrl: input.publicApiUrl,
            secret: input.secret,
            webOrigin: input.webOrigin,
            database: drizzleAdapter(getDb(), {
                provider: "pg",
                schema: authSchema,
            }),
        }),
    );
    const oauthResourceClient = oauthProviderResourceClient(auth);
    return {
        auth,
        oauthResourceClient,
        ...urls,
        authBasePath: AUTH_BASE_PATH,
    };
}

export type MedialitAuth = ReturnType<typeof createMedialitAuth>;
