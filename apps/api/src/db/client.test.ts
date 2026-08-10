import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "./client";

test("createDatabase rejects a legacy MongoDB connection string", () => {
    assert.throws(
        () => createDatabase("mongodb://localhost/medialit"),
        /must use the postgres:\/\/ or postgresql:\/\/ protocol/,
    );
});
