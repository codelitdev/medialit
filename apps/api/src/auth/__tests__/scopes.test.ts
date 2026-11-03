import { test } from "node:test";
import assert from "node:assert/strict";
import { requireScope, toolScope } from "../scopes.js";
import { medialitMcpTools } from "../../mcp/server.js";
import type { MedialitMcpContext } from "../../mcp/context.js";

const READ_ONLY_TOOLS = new Set([
    "list_media",
    "get_media",
    "get_media_count",
    "get_total_storage",
    "get_media_settings",
    "whoami",
]);

function context(scopes: string[]): MedialitMcpContext {
    return {
        authKind: "oauth",
        userId: "user-1",
        user: { _id: "user-1" },
        appId: "app-1",
        scopes,
    };
}

test("only read tools get the read scope", () => {
    assert.equal(toolScope("read"), "data:read");
    assert.equal(toolScope("write"), "data:write");
    assert.equal(toolScope("destructive"), "data:write");
});

test("tools marked read-only are exactly the read tools", () => {
    for (const tool of medialitMcpTools()) {
        assert.equal(
            tool.risk === "read",
            READ_ONLY_TOOLS.has(tool.name),
            tool.name,
        );
    }
});

test("every MCP tool rejects a token without its scope", async () => {
    const tools = medialitMcpTools();
    assert.equal(tools.length, 11);
    for (const tool of tools) {
        const scope = READ_ONLY_TOOLS.has(tool.name)
            ? "data:read"
            : "data:write";
        const result = (await tool.handler({
            context: context([]),
            args: {},
            signal: new AbortController().signal,
        })) as { error: { code: string; safeDetails: any } };
        assert.equal(result.error.code, "forbidden", tool.name);
        assert.equal(result.error.safeDetails.requiredScope, scope, tool.name);
    }
});

test("a read-only token cannot write", async () => {
    const write = medialitMcpTools().filter((tool) => tool.risk !== "read");
    for (const tool of write) {
        const result = (await tool.handler({
            context: context(["data:read"]),
            args: {},
            signal: new AbortController().signal,
        })) as { error: { safeDetails: any } };
        assert.equal(
            result.error.safeDetails.reason,
            "insufficient_scope",
            tool.name,
        );
    }
});

test("destructive tools advertise confirm", () => {
    for (const tool of medialitMcpTools()) {
        const shape = (tool.inputSchema as any).shape;
        assert.equal(
            "confirm" in shape,
            tool.risk === "destructive",
            tool.name,
        );
    }
});

function response() {
    return {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: undefined as unknown,
        setHeader(name: string, value: string) {
            this.headers[name] = value;
        },
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(body: unknown) {
            this.body = body;
            return this;
        },
    };
}

test("REST routes reject a token without the required scope", () => {
    const res = response();
    let nextCalled = false;
    requireScope("data:write")({ scopes: ["data:read"] }, res as any, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(
        res.headers["WWW-Authenticate"],
        'Bearer error="insufficient_scope", scope="data:write"',
    );
    assert.deepEqual(
        (res.body as { error: string }).error,
        "insufficient_scope",
    );
});

test("REST routes pass a token with the required scope", () => {
    let nextCalled = false;
    requireScope("data:read")(
        { scopes: ["data:read"] },
        response() as any,
        () => {
            nextCalled = true;
        },
    );
    assert.equal(nextCalled, true);
});
