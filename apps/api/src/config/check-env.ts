/** Throws when what both the API and the worker need to reach the database
 * and storage isn't set. */
export function checkStorageConfig(): void {
    const missing = [
        "DATABASE_URL",
        "CLOUD_KEY",
        "CLOUD_SECRET",
        "CLOUD_BUCKET_NAME",
        "CLOUD_PUBLIC_BUCKET_NAME",
    ].filter((name) => !process.env[name]);
    if (missing.length > 0) {
        throw new Error(`Not set: ${missing.join(", ")}`);
    }
}
