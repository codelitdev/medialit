export interface OauthRevokedToken {
    jti: string;
    tokenType: "refresh_token";
    userId: string;
    clientId: string;
    expiresAt: Date;
    revokedAt: Date;
}
