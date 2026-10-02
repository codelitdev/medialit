import { maxUploadFor } from "../../billing/entitlements";

export default function getMaxFileUploadSize(req: any): number {
    return maxUploadFor(req.user);
}
