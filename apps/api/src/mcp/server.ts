import crypto from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerMediaTools } from "./tools/media";
import { registerSignatureTool } from "./tools/signature";
import { registerSettingsTools } from "./tools/settings";
import { registerUploadTool } from "./tools/upload";
import { hasScope, insufficientScopeMessage, toolScope } from "../auth/scopes";

/**
 * Wrap tool registration so every tool checks the caller's OAuth scopes:
 * tools annotated `readOnlyHint: true` need data:read, all others need
 * data:write. API keys carry both scopes.
 */
export function enforceToolScopes(server: McpServer): void {
    const register = server.registerTool.bind(server) as (
        ...args: any[]
    ) => any;
    (server as any).registerTool = (
        name: string,
        config: { annotations?: { readOnlyHint?: boolean } },
        handler: (args: any, extra: any) => any,
    ) => {
        const scope = toolScope(config.annotations?.readOnlyHint);
        return register(name, config, (args: any, extra: any) => {
            if (!hasScope(extra.authInfo?.scopes, scope)) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: insufficientScopeMessage(scope),
                        },
                    ],
                    isError: true,
                };
            }
            return handler(args, extra);
        });
    };
}

export function registerAllTools(server: McpServer): void {
    enforceToolScopes(server);
    registerMediaTools(server);
    registerSignatureTool(server);
    registerSettingsTools(server);
    registerUploadTool(server);
}

/**
 * Create a new MCP session (transport + server pair).
 * Each connecting client must get its own session — the
 * WebStandardStreamableHTTPServerTransport is single-session by design.
 */
export function createMCPSession(
    onsessioninitialized: (sessionId: string) => void,
    onsessionclosed: (sessionId: string) => void,
): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized,
        onsessionclosed,
    });
    const server = new McpServer({
        name: "MediaLit",
        version: "1.0.0",
        description:
            "MediaLit MCP server — manage media files, storage, and upload settings for a MediaLit account. Supports listing, inspecting, deleting, and sealing media items, querying storage usage, generating upload signatures, and configuring media processing settings.",
    });
    registerAllTools(server);
    server.connect(transport);
    return transport;
}
