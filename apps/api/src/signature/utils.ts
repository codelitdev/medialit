export function getSignatureFromReq(req: any) {
    return (
        req.query.signature ||
        req.headers["x-medialit-signature"] ||
        req.headers["X-Medialit-Signature"]
    );
}
