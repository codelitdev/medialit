import mongoose from 'mongoose';
import {
    APIKEY_RESTRICTION_REFERRER,
    APIKEY_RESTRICTION_IP,
    APIKEY_RESTRICTION_CUSTOM
} from '../config/constants';

export interface Apikey {
    key: string;
    userId: mongoose.Types.ObjectId;
    restriction?: typeof APIKEY_RESTRICTION_REFERRER | typeof APIKEY_RESTRICTION_IP | typeof APIKEY_RESTRICTION_CUSTOM;
    httpReferrers: string[];
    ipAddresses: string[];
    custom: string;
}

const ApikeySchema = new mongoose.Schema<Apikey>({
    key: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    restriction: { type: String, enum: [
        APIKEY_RESTRICTION_REFERRER,
        APIKEY_RESTRICTION_IP,
        APIKEY_RESTRICTION_CUSTOM
    ] },
    httpReferrers: [String],
    ipAddresses: [String],
    custom: String
}, {
    timestamps: true
})

export default mongoose.models.Apikey || mongoose.model("Apikey", ApikeySchema);