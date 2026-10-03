import { describe, expect, test } from "bun:test";
import { missingImportTables, mongoMediaIsTemp } from "./import-mongo";

describe("mongoMediaIsTemp", () => {
    test("treats only an explicit true as a draft", () => {
        expect(mongoMediaIsTemp(true)).toBe(true);
    });

    test("keeps sealed files permanent so cleanup cannot delete them", () => {
        expect(mongoMediaIsTemp(undefined)).toBe(false);
        expect(mongoMediaIsTemp(null)).toBe(false);
        expect(mongoMediaIsTemp(false)).toBe(false);
    });
});

describe("missingImportTables", () => {
    test("reports every table the importer writes", () => {
        expect(missingImportTables([])).toEqual([
            "user",
            "profiles",
            "api_keys",
            "media",
            "media_settings",
            "signatures",
        ]);
    });

    test("accepts a database that already has those tables", () => {
        expect(
            missingImportTables([
                "user",
                "profiles",
                "api_keys",
                "media",
                "media_settings",
                "signatures",
                "billing_subscriptions",
            ]),
        ).toEqual([]);
    });
});
