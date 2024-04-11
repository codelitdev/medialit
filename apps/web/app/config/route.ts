export const dynamic = "force-dynamic";

export function GET(request: Request, response: Response) {
    return Response.json({
        posthog: process.env.Posthog_ID,
        crisp: process.env.Crisp_ID,
    });
}
