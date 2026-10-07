import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    external: ["react"],
    // Bundling drops the directive from the source files.
    banner: { js: '"use client";' },
    outExtension: ({ format }) => ({
        js: format === "cjs" ? ".cjs" : ".mjs",
    }),
});
