export const dynamic = "force-dynamic";

export function GET() {
    return Response.json({
        posthog: process.env.POSTHOG_ID,
        crisp: process.env.CRISP_ID,
    });
}
