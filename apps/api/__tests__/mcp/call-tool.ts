import { medialitMcpTools } from "../../src/mcp/server";
import type { MedialitMcpContext } from "../../src/mcp/context";

/** Runs a tool the way the kit does after authentication, with the args
 * already parsed. */
export async function callTool(
    name: string,
    context: Partial<MedialitMcpContext> & { user: any },
    args: Record<string, unknown> = {},
): Promise<any> {
    const tool = medialitMcpTools().find(
        (candidate) => candidate.name === name,
    );
    if (!tool) throw new Error(`No MCP tool named ${name}`);
    return tool.handler({
        context: {
            authKind: "apikey",
            userId: context.user._id,
            appId: "test-app",
            scopes: ["data:read", "data:write"],
            ...context,
        },
        args: tool.inputSchema.parse(args),
        signal: new AbortController().signal,
    });
}
