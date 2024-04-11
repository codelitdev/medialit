export const dynamic = "force-dynamic";

export function GET(request: Request, response: Response) {
    return Response.json({
        posthog: process.env.POSTHOG_ID,
        crisp: process.env.CRISP_ID,
    });
}
