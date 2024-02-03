import mongoose from "mongoose";
import { APIKEY_RESTRICTION } from "./api-key-restriction";

export interface Apikey {
    name: string;
    key: string;
    userId: mongoose.Types.ObjectId;
    restriction?: APIKEY_RESTRICTION;
    httpReferrers?: string[];
    ipAddresses?: string[];
    custom?: string;
    internal?: boolean;
    deleted: boolean;
}
