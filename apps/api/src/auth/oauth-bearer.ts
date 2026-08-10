import {
    getOAuthResourceClient,
    authIssuer,
    validOAuthAudiences,
} from "./better-auth";

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringClaims(value: unknown): string[] {
    if (typeof value === "string") return [value];
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

type VerifyBearerToken = (
    token: string,
    options: {
        verifyOptions: {
            issuer: string;
            audience: string[];
        };
    },
) => Promise<Record<string, unknown>>;

/** Verifies tokens issued by this deployment's Better Auth OAuth provider. */
export async function validateOAuthBearer(
    token: string,
    verifyBearerToken: VerifyBearerToken = (token, options) =>
        getOAuthResourceClient().getActions().verifyBearerToken(token, options),
): Promise<{ userId: string; clientId: string; scopes: string[] } | null> {
    try {
        const claims = await verifyBearerToken(token, {
            verifyOptions: {
                issuer: authIssuer,
                audience: validOAuthAudiences,
            },
        });
        const userId = optionalString(claims.sub);
        const clientId =
            optionalString(claims.azp) ?? optionalString(claims.client_id);
        const audiences = stringClaims(claims.aud).filter((audience) =>
            validOAuthAudiences.includes(audience),
        );
        if (!userId || !clientId || audiences.length === 0) return null;

        return {
            userId,
            clientId,
            scopes: stringClaims(claims.scope).flatMap((scope) =>
                scope.split(/\s+/).filter(Boolean),
            ),
        };
    } catch {
        return null;
    }
}
