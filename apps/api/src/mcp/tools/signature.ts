import type { McpToolRegistrar } from "../server";
import { z } from "zod";
import { generateSignature } from "../../signature/service";
import { getMcpAuth } from "../auth-context";
import { AUTH_ERROR, INTERNAL_ERROR } from "./responses";
import { signatureSchema } from "./schemas";

export function registerSignatureTool(server: McpToolRegistrar): void {
    server.registerTool(
        "create_upload_signature",
        {
            description:
                "Generates a time-limited HMAC signature that authorizes a direct client-side file upload to MediaLit storage. The returned signature must be passed by the client when initiating the upload.",
            inputSchema: {
                group: z
                    .string()
                    .optional()
                    .describe(
                        "Optional group label to associate with the uploaded file",
                    ),
            },
            outputSchema: signatureSchema,
            annotations: {
                readOnlyHint: false,
                idempotentHint: true,
                openWorldHint: false,
                destructiveHint: false,
            },
        },
        async (args: any, extra: any) => {
            const auth = getMcpAuth(extra);
            if (!auth) return AUTH_ERROR;
            const { userId, apikey } = auth;
            try {
                const signature = await generateSignature({
                    userId,
                    apikey,
                    group: args.group,
                });
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify({ signature }),
                        },
                    ],
                    structuredContent: { signature } as Record<string, unknown>,
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
