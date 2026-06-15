import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateSignature } from "../../signature/service";

export function registerSignatureTool(server: McpServer): void {
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
            outputSchema: z.object({ signature: z.any() }).passthrough(),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async (args: any, extra: any) => {
            const userId = extra.authInfo?.clientId;
            const apikey = extra.authInfo?.token;
            if (!userId || !apikey) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: "Authentication required: valid API credentials were not provided.",
                        },
                    ],
                    isError: true,
                };
            }
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
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: "An error occurred while processing your request.",
                        },
                    ],
                    isError: true,
                };
            }
        },
    );
}
