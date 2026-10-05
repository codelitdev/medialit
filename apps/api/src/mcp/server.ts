import crypto from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { AnyZodObject, ZodRawShape } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerMediaTools } from "./tools/media";
import { registerSignatureTool } from "./tools/signature";
import { registerSettingsTools } from "./tools/settings";
import { registerUploadTool } from "./tools/upload";
import { registerWhoamiTool } from "./tools/whoami";
import { hasScope, insufficientScopeMessage, toolScope } from "../auth/scopes";

export type McpToolConfig = {
    description?: string;
    inputSchema?: ZodRawShape;
    outputSchema?: ZodRawShape | AnyZodObject;
    annotations?: ToolAnnotations;
};

export type McpToolHandler = (args: any, extra: any) => unknown;

export interface McpToolRegistrar {
    registerTool(
        name: string,
        config: McpToolConfig,
        handler: McpToolHandler,
    ): void;
}

/**
 * Registers tools on `server` so every tool checks the caller's OAuth scopes:
 * tools annotated `readOnlyHint: true` need data:read, all others need
 * data:write. API keys carry both scopes.
 *
 * The SDK calls handlers of tools without an input schema with only the
 * request extra. Registered handlers are always called as `(args, extra)`.
 */
export function createToolRegistrar(server: McpServer): McpToolRegistrar {
    return {
        registerTool(name, config, handler) {
            const scope = toolScope(config.annotations?.readOnlyHint);
            const hasInput = config.inputSchema !== undefined;
            const register = server.registerTool.bind(server) as (
                ...args: any[]
            ) => unknown;
            register(name, config, (...callArgs: any[]) => {
                const [args, extra] = hasInput ? callArgs : [{}, callArgs[0]];
                if (!hasScope(extra?.authInfo?.scopes, scope)) {
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
        },
    };
}

export function registerAllTools(server: McpServer): void {
    const tools = createToolRegistrar(server);
    registerWhoamiTool(tools);
    registerMediaTools(tools);
    registerSignatureTool(tools);
    registerSettingsTools(tools);
    registerUploadTool(tools);
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
            "MediaLit MCP server — manage media files, storage, and upload settings for one MediaLit app: the app picked when the client was authorized, or the API key's app. Supports listing, inspecting, deleting, and sealing media items, checking the connected account and app (whoami), querying storage usage, generating upload signatures, and configuring media processing settings.",
    });
    registerAllTools(server);
    server.connect(transport);
    return transport;
}
