import connectToDatabase from "@/lib/connect-db";
import Log from "@/models/log";
import Severity from "@/models/severity";

export async function error(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    await connectToDatabase();
    await Log.create({
        severity: Severity.ERROR,
        message,
        metadata,
    });
}

export async function info(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    await connectToDatabase();
    await Log.create({
        severity: Severity.INFO,
        message,
        metadata,
    });
}

export async function warn(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    await connectToDatabase();
    await Log.create({
        severity: Severity.WARN,
        message,
        metadata,
    });
}
