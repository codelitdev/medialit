export interface OauthPendingAuth {
    pendingId: string;
    clientId: string;
    redirectUri: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    state?: string;
    scope?: string;
    email?: string;
    otpHash?: string;
    otpExpires?: Date;
    otpAttempts?: number;
    otpSentAt?: Date;
    expiresAt: Date;
}
