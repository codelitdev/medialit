import { webServiceApi } from "@/lib/api";
import Severity from "@/models/severity";

async function log(
    severity: "info" | "warn" | "error",
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    try {
        await webServiceApi.log(severity, message, metadata);
    } catch (error) {
        console.error("Failed to persist web log through API", error);
    }
}

export async function error(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    await log(Severity.ERROR, message, metadata);
}

export async function info(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    await log(Severity.INFO, message, metadata);
}

export async function warn(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    await log(Severity.WARN, message, metadata);
}
