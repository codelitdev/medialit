import OAuth2Server from "@node-oauth/oauth2-server";
import { oauthModel } from "./model";

export const oauth = new OAuth2Server({
    model: oauthModel,
    allowEmptyState: true,
    allowExtendedTokenAttributes: true,
    accessTokenLifetime: Number(process.env.TOKEN_TTL_SECONDS) || 900,
    refreshTokenLifetime: 60 * 60 * 24 * 30, // 30 days
    authorizationCodeLifetime: 5 * 60, // 5 min
    requireClientAuthentication: {
        authorization_code: false,
        refresh_token: false,
    },
    alwaysIssueNewRefreshToken: true,
});

export { OAuth2Server };
