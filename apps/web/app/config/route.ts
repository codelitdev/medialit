export const dynamic = "force-dynamic";

export function GET() {
    return Response.json({
        posthog: process.env.POSTHOG_API_KEY || process.env.POSTHOG_ID,
        posthogHost: process.env.POSTHOG_HOST,
        crisp: process.env.CRISP_ID,
        environment: process.env.NODE_ENV || "development",
    });
}
