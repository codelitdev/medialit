import {
    createMcpServerKit,
    type McpServerKit,
} from "@codelitdev/mcp-server-kit";
import { captureException } from "../services/log";
import {
    authenticateMcpRequest,
    type MedialitMcpContext,
    type MedialitMcpTool,
    resolveMcpContext,
} from "./context";
import { mediaTools } from "./tools/media";
import { settingsTools } from "./tools/settings";
import { signatureTools } from "./tools/signature";
import { uploadTools } from "./tools/upload";
import { whoamiTools } from "./tools/whoami";

export const MEDIALIT_MCP_VERSION = "2.0.0";

/** Every MediaLit MCP tool, in a stable order so catalog caches and upstream
 * prompt caches see a deterministic tool list. */
export function medialitMcpTools(): MedialitMcpTool[] {
    return [
        ...whoamiTools(),
        ...mediaTools(),
        ...signatureTools(),
        ...settingsTools(),
        ...uploadTools(),
    ];
}

/**
 * MediaLit's MCP endpoint on the CodeLit Platform kit: stateless, protocol
 * 2026-07-28 plus 2025-era Streamable HTTP, with MediaLit's own credential
 * and app resolution.
 */
export function createMedialitMcp(): McpServerKit<MedialitMcpContext> {
    return createMcpServerKit<MedialitMcpContext>({
        name: "MediaLit",
        version: MEDIALIT_MCP_VERSION,
        description:
            "MediaLit MCP server — manage media files, storage, and upload settings for one MediaLit app: the app picked when the client was authorized, or the API key's app. Supports listing, inspecting, deleting, and sealing media items, checking the connected account and app (whoami), querying storage usage, generating upload signatures, and configuring media processing settings.",
        instructions:
            "Every tool acts on one MediaLit app; whoami shows which. Uploads are temporary until sealed. Deleting and sealing media can't be undone: confirm the target with the user, then pass confirm: true.",
        authenticate: authenticateMcpRequest,
        resolveContext: resolveMcpContext,
        onError: ({ error, source }) => captureException({ error, source }),
        tools: medialitMcpTools(),
    });
}
