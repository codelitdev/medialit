import type { APIKEY_RESTRICTION } from "./api-key-restriction";

export interface Apikey {
    keyId: string;
    name: string;
    key: string;
    userId: string;
    restriction?: APIKEY_RESTRICTION;
    httpReferrers?: string[];
    ipAddresses?: string[];
    default: boolean;
    deleted: boolean;
}
