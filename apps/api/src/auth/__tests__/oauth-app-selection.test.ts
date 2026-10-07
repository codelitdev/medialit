import { test } from "node:test";
import assert from "node:assert/strict";
import {
    createOAuthAppSelectionHooks,
    type OAuthApp,
    type OAuthAppSelectionAdapter,
} from "../oauth-app-selection.js";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const input = { user: { id: "user-1" }, session: { id: "session-1" } };

function app(keyId: string, isDefault = false): OAuthApp {
    return { id: `id-${keyId}`, keyId, name: keyId, isDefault };
}

function hooks(
    apps: OAuthApp[],
    selection: { keyId: string; updatedAt: Date } | null = null,
) {
    const adapter: OAuthAppSelectionAdapter = {
        listAppsForUser: async () => apps,
        getSelection: async () => selection,
        setSelection: async () => {},
    };
    return createOAuthAppSelectionHooks({
        page: "https://api.example/oauth/select-app",
        adapter,
        now: () => NOW,
    });
}

test("a user with one app skips the picker and gets that app", async () => {
    const { postLogin } = hooks([app("only", true)]);

    assert.equal(await postLogin.shouldRedirect(input), false);
    assert.equal(await postLogin.consentReferenceId(input), "only");
});

test("a user with several apps is sent to the picker", async () => {
    const { postLogin } = hooks([app("a", true), app("b")]);

    assert.equal(await postLogin.shouldRedirect(input), true);
    assert.equal(await postLogin.consentReferenceId(input), undefined);
});

test("a fresh selection continues the flow with the picked app", async () => {
    const { postLogin } = hooks([app("a", true), app("b")], {
        keyId: "b",
        updatedAt: new Date(NOW - 60_000),
    });

    assert.equal(await postLogin.shouldRedirect(input), false);
    assert.equal(await postLogin.consentReferenceId(input), "b");
});

test("a selection from an earlier authorization shows the picker again", async () => {
    const { postLogin } = hooks([app("a", true), app("b")], {
        keyId: "b",
        updatedAt: new Date(NOW - 60 * 60_000),
    });

    assert.equal(await postLogin.shouldRedirect(input), true);
});

test("a selection of an app the user no longer has is ignored", async () => {
    const { postLogin } = hooks([app("a", true), app("b")], {
        keyId: "gone",
        updatedAt: new Date(NOW),
    });

    assert.equal(await postLogin.shouldRedirect(input), true);
    assert.equal(await postLogin.consentReferenceId(input), undefined);
});

test("the picked app becomes the token's app_id claim", async () => {
    const { customAccessTokenClaims } = hooks([]);

    assert.deepEqual(await customAccessTokenClaims({ referenceId: "b" }), {
        app_id: "b",
    });
    assert.deepEqual(await customAccessTokenClaims({}), {});
});
