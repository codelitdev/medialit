import {
    maxFileUploadSizeNotSubscribed,
    maxFileUploadSizeSubscribed,
} from "../../config/constants";
import { getSubscriptionStatus } from "@medialit/models";

export default function getMaxFileUploadSize(req: any): number {
    return getSubscriptionStatus(req.user)
        ? maxFileUploadSizeSubscribed
        : maxFileUploadSizeNotSubscribed;
}
