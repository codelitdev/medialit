/**
 * Runs the REST, WebP, video, MCP and CLI integration tests against one live API:
 * MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 \
 *   bun --filter @medialit/integration-tests test:integration
 *
 * Use a dedicated key with no concurrent media writes or media-settings
 * changes. Each suite deletes only its own media, and a failing suite does
 * not stop the others.
 */
import { runCliIntegrationTests } from "./cli";
import { runMcpIntegrationTests } from "./mcp";
import { runIntegrationTests } from "./rest";
import { runWebpIntegrationTests } from "./webp";
import { runVideoIntegrationTests } from "./video";

export { runSyntheticCheck } from "./synthetic";
export {
    runCliIntegrationTests,
    runIntegrationTests,
    runMcpIntegrationTests,
    runWebpIntegrationTests,
    runVideoIntegrationTests,
};

export async function runAllIntegrationTests(): Promise<boolean> {
    const suites = [
        ["REST", runIntegrationTests],
        ["WebP", runWebpIntegrationTests],
        ["Video", runVideoIntegrationTests],
        ["MCP", runMcpIntegrationTests],
        ["CLI", runCliIntegrationTests],
    ] as const;

    const failed: string[] = [];
    for (const [name, run] of suites) {
        console.log(`\n=== ${name} ===`);
        try {
            await run();
        } catch (error) {
            failed.push(name);
            console.error(
                `FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    console.log(
        failed.length
            ? `\n${failed.length} of ${suites.length} suites failed: ${failed.join(", ")}`
            : `\nAll ${suites.length} suites passed`,
    );
    return failed.length === 0;
}
