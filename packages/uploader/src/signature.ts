import { MediaLitUploadError } from "./errors";
import type { SignatureOptions, UploadSignature } from "./types";

export async function resolveSignature(
    options: SignatureOptions,
    signal?: AbortSignal,
): Promise<UploadSignature> {
    if (options.getSignature) {
        return validate(await options.getSignature());
    }
    if (!options.signatureEndpoint) {
        throw new MediaLitUploadError(
            "Pass either signatureEndpoint or getSignature",
        );
    }

    const response = await fetch(options.signatureEndpoint, {
        method: "POST",
        credentials: "same-origin",
        signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new MediaLitUploadError(
            body?.error ||
                body?.message ||
                `Signature request failed with status ${response.status}`,
            { status: response.status },
        );
    }
    return validate(body);
}

function validate(value: Partial<UploadSignature> | null | undefined) {
    if (!value?.signature || !value?.endpoint) {
        throw new MediaLitUploadError(
            "The signature response must include signature and endpoint",
        );
    }
    return { signature: value.signature, endpoint: value.endpoint };
}
