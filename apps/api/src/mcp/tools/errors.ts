import {
    createPlatformError,
    type PlatformError,
    type PlatformErrorCode,
    type PlatformSafeDetails,
} from "@codelitdev/platform";

/** A tool's failure: the kit returns it as an `isError` result carrying the
 * platform `code`, plus `details` (a stable `reason`, and a `message` for the
 * model when the reason alone is not enough). */
export type ToolError = { error: PlatformError };

export function toolError(
    code: PlatformErrorCode,
    details?: PlatformSafeDetails,
): ToolError {
    return {
        error: createPlatformError(
            code,
            details ? { safeDetails: details } : {},
        ),
    };
}

export const notFound = (): ToolError => toolError("not_found");

export function isToolError(value: unknown): value is ToolError {
    return Boolean(value && typeof value === "object" && "error" in value);
}
