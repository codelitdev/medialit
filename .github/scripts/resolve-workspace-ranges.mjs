// Rewrites `workspace:` dependency ranges in public packages to real version
// ranges before `changeset publish`. Changesets publishes with `npm publish`,
// which copies `workspace:^` into the published package.json as is, and npm
// cannot install that. Runs on CI's throwaway checkout only.
//
// workspace:^ -> ^<version>, workspace:~ -> ~<version>,
// workspace:* -> <version>, workspace:<range> -> <range>
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || process.cwd();
const rootManifest = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
);

const manifestPaths = rootManifest.workspaces.flatMap((pattern) => {
    if (!pattern.endsWith("/*")) {
        throw new Error(`Unsupported workspace pattern: ${pattern}`);
    }
    const dir = join(root, pattern.slice(0, -2));
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(dir, entry.name, "package.json"))
        .filter((path) => existsSync(path));
});

const manifests = manifestPaths.map((path) => ({
    path,
    json: JSON.parse(readFileSync(path, "utf8")),
}));
const versions = new Map(
    manifests.map(({ json }) => [json.name, json.version]),
);

function resolve(name, range) {
    const version = versions.get(name);
    if (!version) throw new Error(`No workspace package named ${name}`);
    const spec = range.slice("workspace:".length);
    if (spec === "^" || spec === "~") return `${spec}${version}`;
    if (spec === "*") return version;
    return spec;
}

const fields = [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "devDependencies",
];
for (const { path, json } of manifests) {
    if (json.private) continue;
    let changed = false;
    for (const field of fields) {
        for (const [name, range] of Object.entries(json[field] || {})) {
            if (typeof range !== "string" || !range.startsWith("workspace:")) {
                continue;
            }
            json[field][name] = resolve(name, range);
            console.log(
                `${json.name}: ${name} ${range} -> ${json[field][name]}`,
            );
            changed = true;
        }
    }
    if (changed) writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}
