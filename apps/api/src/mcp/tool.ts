import type { McpToolRisk } from "@codelitdev/mcp-server-kit";
import { z } from "zod";
import { hasScope, insufficientScopeMessage, toolScope } from "../auth/scopes";
import type { MedialitMcpContext, MedialitMcpTool } from "./context";
import { isToolError, toolError } from "./tools/errors";

export type MedialitToolDefinition<Shape extends z.ZodRawShape> = {
    name: string;
    /** Shown to people in place of `name`; directories require one. */
    title: string;
    description: string;
    risk: McpToolRisk;
    inputSchema: z.ZodObject<Shape>;
    outputSchema: z.AnyZodObject;
    annotations?: MedialitMcpTool["annotations"];
    handler: (input: {
        context: MedialitMcpContext;
        args: z.infer<z.ZodObject<Shape>>;
        signal: AbortSignal;
    }) => Promise<unknown>;
};

const confirmSchema = z
    .boolean()
    .optional()
    .describe(
        "Set to true once the user has confirmed this action; it can't be undone.",
    );

/**
 * A MediaLit MCP tool. Read tools need the data:read scope and every other
 * tool needs data:write; API keys carry both. A destructive tool advertises
 * `confirm`, which the kit requires to be `true`. Results are parsed with the
 * output schema, which drops fields the schema does not list: the SDK rejects
 * a result with properties its advertised schema does not allow.
 */
export function medialitTool<Shape extends z.ZodRawShape>(
    definition: MedialitToolDefinition<Shape>,
): MedialitMcpTool {
    const { handler, ...tool } = definition;
    const scope = toolScope(tool.risk);
    return {
        ...tool,
        inputSchema:
            tool.risk === "destructive"
                ? tool.inputSchema.extend({ confirm: confirmSchema })
                : tool.inputSchema,
        annotations: { openWorldHint: false, ...tool.annotations },
        async handler({ context, args, signal }) {
            if (!hasScope(context.scopes, scope)) {
                return toolError("forbidden", {
                    reason: "insufficient_scope",
                    requiredScope: scope,
                    message: insufficientScopeMessage(scope),
                });
            }
            const result = await handler({
                context,
                args: args as z.infer<z.ZodObject<Shape>>,
                signal,
            });
            return isToolError(result)
                ? result
                : tool.outputSchema.parse(result);
        },
    };
}
