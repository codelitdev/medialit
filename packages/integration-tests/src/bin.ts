import { runSyntheticCheck } from "./synthetic";
import { runCliIntegrationTests } from "./cli";
import { runAllIntegrationTests } from "./index";
import { runMcpIntegrationTests } from "./mcp";
import { runIntegrationTests } from "./rest";
import { runWebpIntegrationTests } from "./webp";
import { runVideoIntegrationTests } from "./video";

const HELP = `Usage: medialit-integration-tests <command>

Commands:
  synthetic  Quick check that MediaLit is up: upload, seal, download and
             delete one file. Safe to run against production every few
             minutes.
  all        Run the REST, WebP, video, MCP and CLI suites
  rest       Run the REST API suite
  webp       Run the WebP-at-seal and thumbnail suite
  video      Run the video settings and processing suite
  mcp        Run the MCP server suite
  cli        Run the CLI suite (set MEDIALIT_CLI to the medialit command)

The suites change settings and create files, so run them against a test app.

Environment:
  MEDIALIT_APIKEY                    API key of the app to test (required)
  MEDIALIT_SERVER                    MediaLit URL (default: localhost:8000)
  MEDIALIT_SYNTHETIC_HEARTBEAT_URL   synthetic: heartbeat to ping after each
                                     run, <url>/fail on failure
`;

async function main(command?: string): Promise<boolean> {
    switch (command) {
        case "synthetic":
            return (await runSyntheticCheck()).ok;
        case "all":
            return runAllIntegrationTests();
        case "rest":
            await runIntegrationTests();
            return true;
        case "webp":
            await runWebpIntegrationTests();
            return true;
        case "video":
            await runVideoIntegrationTests();
            return true;
        case "mcp":
            await runMcpIntegrationTests();
            return true;
        case "cli":
            await runCliIntegrationTests();
            return true;
        case undefined:
        case "help":
        case "--help":
        case "-h":
            console.log(HELP);
            return true;
        default:
            console.error(`Unknown command "${command}".\n\n${HELP}`);
            return false;
    }
}

main(process.argv[2])
    .then((ok) => {
        if (!ok) process.exitCode = 1;
    })
    .catch((error) => {
        console.error(
            `FAIL: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exitCode = 1;
    });
