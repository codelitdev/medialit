import { z } from "zod";
import { generateSignature } from "../../signature/service";
import type { MedialitMcpTool } from "../context";
import { medialitTool } from "../tool";
import { signatureSchema } from "./schemas";

export const signatureTools = (): MedialitMcpTool[] => [
    medialitTool({
        name: "create_upload_signature",
        title: "Create upload signature",
        risk: "write",
        description:
            "Generates a time-limited HMAC signature that authorizes a direct client-side file upload to MediaLit storage. The returned signature must be passed by the client when initiating the upload.",
        inputSchema: z.object({
            group: z
                .string()
                .optional()
                .describe(
                    "Optional group label to associate with the uploaded file",
                ),
        }),
        outputSchema: signatureSchema,
        annotations: { idempotentHint: true },
        async handler({ context, args }) {
            const signature = await generateSignature({
                userId: context.userId,
                appId: context.appId,
                apiKeyId: context.apiKeyId,
                group: args.group,
            });
            return { signature };
        },
    }),
];
