import { MediaLit, type MediaLitConfig } from "./index";

export interface SignatureGrant {
    /** Files uploaded with this signature are put in this group. */
    group?: string;
}

export interface SignatureHandlerOptions extends MediaLitConfig {
    /**
     * Decides whether the request may upload. Return `false` or `null` to
     * refuse with 401, `true` to allow, or a grant to allow with a group.
     * Anyone who passes this check can upload to your MediaLit app.
     */
    authorize: (
        request: Request,
    ) =>
        | boolean
        | SignatureGrant
        | null
        | undefined
        | Promise<boolean | SignatureGrant | null | undefined>;
    /** Use an existing client instead of `apiKey` and `endpoint`. */
    client?: MediaLit;
    /**
     * MediaLit URL the browser should upload to, when it differs from the
     * endpoint your server uses (for example inside Docker).
     */
    publicEndpoint?: string;
}

/**
 * Creates a `POST` route handler that returns `{ signature, endpoint }` for
 * browser uploads. Works anywhere with the Fetch API `Request` and `Response`,
 * such as Next.js route handlers, Hono, Remix, and Bun.
 */
export function createSignatureHandler(options: SignatureHandlerOptions) {
    const { authorize, client, publicEndpoint, ...config } = options;
    let medialit = client;

    return async function handler(request: Request): Promise<Response> {
        const grant = await authorize(request);
        if (!grant) {
            return json({ error: "Unauthorized" }, 401);
        }

        try {
            // Created on first use so importing the route does not need the key.
            medialit ??= new MediaLit(config);
            const signature = await medialit.getSignature(
                grant === true ? {} : { group: grant.group },
            );
            return json({
                signature,
                endpoint: publicEndpoint || medialit.endpoint,
            });
        } catch (err) {
            return json(
                {
                    error:
                        err instanceof Error
                            ? err.message
                            : "Failed to get signature",
                },
                500,
            );
        }
    };
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
