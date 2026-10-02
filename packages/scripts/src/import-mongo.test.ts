import { describe, expect, test } from "bun:test";
import { mongoMediaIsTemp } from "./import-mongo";

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
