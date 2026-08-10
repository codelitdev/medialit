import { APIKEY_RESTRICTION } from "./api-key-restriction";

export interface Apikey {
    id?: string;
    keyId: string;
    name: string;
    key: string;
    userId: string;
    restriction?: APIKEY_RESTRICTION | null;
    httpReferrers?: string[] | null;
    ipAddresses?: string[] | null;
    default: boolean;
    deleted: boolean;
}
