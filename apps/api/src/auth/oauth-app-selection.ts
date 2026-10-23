import { getOAuthAppSelection, listApps, setOAuthAppSelection } from "@/db";

export const APP_ID_CLAIM = "app_id";

// The picker shows on every new authorization. A selection only skips it for
// the rest of the flow it was made in, which the authorization code lifetime
// bounds (Better Auth's default `codeExpiresIn` is 10 minutes).
const SELECTION_FRESH_MS = 10 * 60 * 1000;

export type OAuthApp = {
    /** Internal ID. */
    id: string;
    /** Public ID; what the picker posts and the `app_id` claim carries. */
    appId: string;
    name: string;
    isDefault: boolean;
};

export interface OAuthAppSelectionAdapter {
    listAppsForUser(userId: string): Promise<OAuthApp[]>;
    getSelection(
        sessionId: string,
    ): Promise<{ appId: string; updatedAt: Date } | null>;
    /** `appId` is the internal app ID. */
    setSelection(sessionId: string, appId: string): Promise<void>;
}

export const oauthAppSelectionAdapter: OAuthAppSelectionAdapter = {
    async listAppsForUser(userId) {
        const apps = await listApps(userId);
        return apps.map((app) => ({
            id: app.id,
            appId: app.appId,
            name: app.name,
            isDefault: Boolean(app.default),
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
        return { requiresSelection: false, appId: apps[0].appId };
    }
    if (apps.length === 0) {
        return { requiresSelection: false, appId: undefined };
    }
    const selection = await adapter.getSelection(sessionId);
    const valid = selection
        ? apps.some((app) => app.appId === selection.appId)
        : false;
    const fresh =
        valid && now - selection!.updatedAt.getTime() < SELECTION_FRESH_MS;
    return {
        requiresSelection: !fresh,
        appId: valid ? selection!.appId : undefined,
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
                ).appId;
            },
        },
        async customAccessTokenClaims(input: { referenceId?: string | null }) {
            return input.referenceId
                ? { [APP_ID_CLAIM]: input.referenceId }
                : {};
        },
    };
}
