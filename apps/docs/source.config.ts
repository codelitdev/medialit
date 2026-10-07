import { defineDocs, defineConfig } from "fumadocs-mdx/config";

// Options: https://fumadocs.vercel.app/docs/mdx/collections#define-docs
export const docs = defineDocs({
    dir: "content/docs",
    docs: {
        postprocess: {
            includeProcessedMarkdown: true,
        },
    },
});

// ```npm code blocks show one tab per package manager. The docs only use
// `npm install`, so translating that command is enough.
const install = (command: string) => (cmd: string) =>
    cmd.replace(/^npm install\b/gm, command);

export default defineConfig({
    mdxOptions: {
        remarkNpmOptions: {
            // Picking a package manager once applies to every page.
            persist: { id: "package-manager" },
            packageManagers: [
                { name: "npm", command: (cmd) => cmd },
                { name: "pnpm", command: install("pnpm add") },
                {
                    name: "yarn",
                    // Yarn has no `-g` flag for add.
                    command: (cmd) =>
                        install("yarn add")(
                            cmd.replace(
                                /^npm install -g\b/gm,
                                "yarn global add",
                            ),
                        ),
                },
                { name: "bun", command: install("bun add") },
            ],
        },
    },
});
