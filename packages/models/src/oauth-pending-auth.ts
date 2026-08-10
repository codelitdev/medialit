export interface OauthPendingAuth {
    pendingId: string;
    clientId: string;
    redirectUri: string;
    codeChallenge?: string | null;
    codeChallengeMethod?: string | null;
    state?: string | null;
    scope?: string | null;
    email?: string | null;
    otpHash?: string | null;
    otpExpires?: Date | null;
    otpAttempts?: number | null;
    otpSentAt?: Date | null;
    expiresAt: Date;
}
