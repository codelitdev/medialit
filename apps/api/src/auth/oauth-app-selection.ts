import { getOAuthAppSelection, listApiKeys, setOAuthAppSelection } from "@/db";

export const APP_ID_CLAIM = "app_id";

// The picker shows on every new authorization. A selection only skips it for
// the rest of the flow it was made in, which the authorization code lifetime
// bounds (Better Auth's default `codeExpiresIn` is 10 minutes).
const SELECTION_FRESH_MS = 10 * 60 * 1000;

export type OAuthApp = {
    id: string;
    keyId: string;
    name: string;
    isDefault: boolean;
};

export interface OAuthAppSelectionAdapter {
    listAppsForUser(userId: string): Promise<OAuthApp[]>;
    getSelection(
        sessionId: string,
    ): Promise<{ keyId: string; updatedAt: Date } | null>;
    setSelection(sessionId: string, apiKeyId: string): Promise<void>;
}

export const oauthAppSelectionAdapter: OAuthAppSelectionAdapter = {
    async listAppsForUser(userId) {
        const keys = await listApiKeys(userId);
        return keys.map((key) => ({
            id: key.id,
            keyId: key.keyId,
            name: key.name,
            isDefault: Boolean(key.default),
        }));
    },
    getSelection: getOAuthAppSelection,
    setSelection: setOAuthAppSelection,
};

async function resolveSelection(
    adapter: OAuthAppSelectionAdapter,
    userId: string,
    sessionId: string,
    now: number,
) {
    const apps = await adapter.listAppsForUser(userId);
    // A single app is selected without asking.
    if (apps.length === 1) {
        return { requiresSelection: false, keyId: apps[0].keyId };
    }
    if (apps.length === 0) {
        return { requiresSelection: false, keyId: undefined };
    }
    const selection = await adapter.getSelection(sessionId);
    const valid = selection
        ? apps.some((app) => app.keyId === selection.keyId)
        : false;
    const fresh =
        valid && now - selection!.updatedAt.getTime() < SELECTION_FRESH_MS;
    return {
        requiresSelection: !fresh,
        keyId: valid ? selection!.keyId : undefined,
    };
}

/**
 * `oauthProvider` options that send the user to the app picker after sign-in
 * and put the picked app on the access token. The app is the consent
 * `referenceId`, so consent is recorded per app.
 */
export function createOAuthAppSelectionHooks(options: {
    page: string;
    adapter: OAuthAppSelectionAdapter;
    now?: () => number;
}) {
    const now = options.now ?? Date.now;
    return {
        postLogin: {
            page: options.page,
            async shouldRedirect(input: {
                user: { id: string };
                session: { id: string };
            }) {
                return (
                    await resolveSelection(
                        options.adapter,
                        input.user.id,
                        input.session.id,
                        now(),
                    )
                ).requiresSelection;
            },
            async consentReferenceId(input: {
                user: { id: string };
                session: { id: string };
            }) {
                return (
                    await resolveSelection(
                        options.adapter,
                        input.user.id,
                        input.session.id,
                        now(),
                    )
                ).keyId;
            },
        },
        async customAccessTokenClaims(input: { referenceId?: string | null }) {
            return input.referenceId
                ? { [APP_ID_CLAIM]: input.referenceId }
                : {};
        },
    };
}
