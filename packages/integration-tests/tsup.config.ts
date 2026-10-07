import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/bin.ts"],
    format: ["esm"],
    target: "node18",
    clean: true,
    banner: { js: "#!/usr/bin/env node" },
    outExtension: () => ({ js: ".mjs" }),
});
