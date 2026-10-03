import { test } from "node:test";
import assert from "node:assert/strict";
import { requireScope, toolScope } from "../scopes.js";
import { enforceToolScopes, registerAllTools } from "../../mcp/server.js";

const READ_ONLY_TOOLS = new Set([
    "list_media",
    "get_media",
    "get_media_count",
    "get_total_storage",
    "get_media_settings",
]);

type Registered = {
    name: string;
    handler: (args: any, extra: any) => any;
};

function fakeServer() {
    const tools: Registered[] = [];
    const server: any = {
        registerTool(name: string, _config: unknown, handler: any) {
            tools.push({ name, handler });
        },
    };
    return { server, tools };
}

test("only tools marked read-only get the read scope", () => {
    assert.equal(toolScope(true), "data:read");
    assert.equal(toolScope(false), "data:write");
    assert.equal(toolScope(undefined), "data:write");
});

test("every MCP tool rejects a token without its scope", async () => {
    const { server, tools } = fakeServer();
    registerAllTools(server);

    assert.equal(tools.length, 10);
    for (const tool of tools) {
        const scope = READ_ONLY_TOOLS.has(tool.name)
            ? "data:read"
            : "data:write";
        const result = await tool.handler({}, { authInfo: { scopes: [] } });
        assert.equal(result.isError, true, tool.name);
        assert.match(result.content[0].text, new RegExp(scope), tool.name);
    }
});

test("a read-only token can read but not write", async () => {
    const { server, tools } = fakeServer();
    enforceToolScopes(server);
    const calls: string[] = [];
    server.registerTool("read", { annotations: { readOnlyHint: true } }, () =>
        calls.push("read"),
    );
    server.registerTool("write", { annotations: { readOnlyHint: false } }, () =>
        calls.push("write"),
    );
    const extra = { authInfo: { scopes: ["data:read"] } };

    for (const tool of tools) await tool.handler({}, extra);

    assert.deepEqual(calls, ["read"]);
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
