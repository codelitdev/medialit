export interface OauthClient {
    clientId: string;
    clientIdIssuedAt: number;
    redirectUris: string[];
    grantTypes: string[];
    tokenEndpointAuthMethod: "none";
    clientName?: string | null;
    scope?: string | null;
}
