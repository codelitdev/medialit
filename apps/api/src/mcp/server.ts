import crypto from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerMediaTools } from "./tools/media";
import { registerSignatureTool } from "./tools/signature";
import { registerSettingsTools } from "./tools/settings";
import { registerUploadTool } from "./tools/upload";

function registerAllTools(server: McpServer): void {
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
        name: "medialit",
        version: "1.0.0",
        description:
            "MediaLit MCP server — manage media files, storage, and upload settings for a MediaLit account. Supports listing, inspecting, deleting, and sealing media items, querying storage usage, generating upload signatures, and configuring image processing settings.",
    });
    registerAllTools(server);
    server.connect(transport);
    return transport;
}
