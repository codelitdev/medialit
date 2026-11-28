import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import * as commands from "./commands";

const HELP = `Usage: medialit <command> [options]

Commands:
  login                   Log in with your browser and choose an app
  logout                  Log out of the server
  whoami                  Show the server, account, app and storage used
  upload <files...>       Upload and seal files, then print their URLs
  ls                      List sealed files, newest first
  get <id>                Print a file's URL (a fresh one for private files)
  seal <id>               Keep a temporary upload
  rm <id>                 Delete a file
  webhooks ls             List webhook endpoints
  webhooks create <url>   Add an endpoint and print its signing secret
  webhooks update <id>    Change an endpoint (--url, --events, --enable, --disable)
  webhooks rotate <id>    Replace an endpoint's signing secret and print it
  webhooks secret <id>    Print an endpoint's signing secret
  webhooks test <id>      Send a signed test event to an endpoint
  webhooks rm <id>        Delete an endpoint
  settings                Show the app's media settings
  settings set            Change media settings (options below)

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
  --url <url>           webhooks update: new receiving URL
  --events <list>       webhooks create/update: comma-separated events,
                        media.processing.ready, media.processing.failed and
                        media.captions.ready
                        (default: the two processing events)
  --enable, --disable   webhooks create/update: turn sending on or off
  --video-streaming <off|hls|mp4>
                        settings set: how sealed videos are prepared for
                        playback (apps start off). upload, seal: override
                        the app's setting for these files only
  --hls-renditions <list>
                        settings set: comma-separated HLS sizes from 1080p,
                        720p, 480p and 360p, or default
  --webp <on|off>       settings set: convert images to WebP at seal
  --webp-quality <n>    settings set: WebP quality, 1 to 100 (default 80)
  --captions <on|off>   settings set: make captions for sealed videos and
                        audio. upload, seal: override for these files only
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
            url: { type: "string" },
            events: { type: "string" },
            enable: { type: "boolean" },
            disable: { type: "boolean" },
            "video-streaming": { type: "string" },
            "hls-renditions": { type: "string" },
            webp: { type: "string" },
            "webp-quality": { type: "string" },
            captions: { type: "string" },
            help: { type: "boolean", short: "h" },
            version: { type: "boolean", short: "v" },
        },
    });
    const flags: commands.Flags = {
        ...values,
        browser: !values["no-browser"],
        videoStreaming: values["video-streaming"],
        hlsRenditions: values["hls-renditions"],
        webpQuality: values["webp-quality"],
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
        case "webhooks":
            return commands.webhooks(args, flags);
        case "settings":
            return commands.settings(args, flags);
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
