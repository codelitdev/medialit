import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import * as commands from "./commands";

const HELP = `Usage: medialit <command> [options]

Commands:
  login                 Log in with your browser and choose an app
  logout                Log out of the server
  whoami                Show the server, account, app and storage used
  upload <files...>     Upload and seal files, then print their URLs
  ls                    List sealed files, newest first
  get <id>              Print a file's URL (a fresh one for private files)
  seal <id>             Keep a temporary upload
  rm <id>               Delete a file

Options:
  --endpoint <url>      MediaLit server, for self-hosted instances
                        (default: the server you last logged in to,
                        or https://api.medialit.cloud)
  --json                Print JSON
  --public              upload: make files public. ls: only public files
  --private             ls: only private files
  --caption <text>      upload: caption for the files
  --group <name>        upload: put files in a group. ls: only that group
  --temp                upload: don't seal, so unused files are deleted
  --page <n>, --limit <n>   ls: page through files
  --no-browser          login: print the URL instead of opening it
  -h, --help            Show this help
  -v, --version         Show the version

Environment:
  MEDIALIT_API_KEY      Use an API key instead of logging in, for CI
  MEDIALIT_ENDPOINT     Same as --endpoint
`;

async function main(argv: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            endpoint: { type: "string" },
            json: { type: "boolean" },
            public: { type: "boolean" },
            private: { type: "boolean" },
            caption: { type: "string" },
            group: { type: "string" },
            temp: { type: "boolean" },
            page: { type: "string" },
            limit: { type: "string" },
            "no-browser": { type: "boolean" },
            help: { type: "boolean", short: "h" },
            version: { type: "boolean", short: "v" },
        },
    });
    const flags: commands.Flags = {
        ...values,
        browser: !values["no-browser"],
    };
    const [command, ...args] = positionals;

    if (values.version) {
        const require = createRequire(import.meta.url);
        console.log(require("../package.json").version);
        return;
    }
    if (values.help || !command) {
        console.log(HELP);
        return;
    }

    switch (command) {
        case "login":
            return commands.login(flags);
        case "logout":
            return commands.logout(flags);
        case "whoami":
            return commands.whoami(flags);
        case "upload":
            return commands.upload(args, flags);
        case "ls":
        case "list":
            return commands.list(flags);
        case "get":
            return commands.get(args, flags);
        case "seal":
            return commands.seal(args, flags);
        case "rm":
        case "delete":
            return commands.remove(args, flags);
        default:
            throw new Error(
                `Unknown command "${command}". Run \`medialit --help\`.`,
            );
    }
}

main(process.argv.slice(2)).catch((err: Error) => {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
});
