import mongoose from "mongoose";
import { APIKEY_RESTRICTION } from "./api-key-restriction";

export interface Apikey {
    keyId: string;
    name: string;
    key: string;
    userId: mongoose.Types.ObjectId;
    restriction?: APIKEY_RESTRICTION;
    httpReferrers?: string[];
    ipAddresses?: string[];
    custom?: string;
    deleted: boolean;
}
