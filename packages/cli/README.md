# @medialit/cli

Upload and manage [MediaLit](https://medialit.cloud) files from the terminal.

```bash
npm install -g @medialit/cli
medialit login
medialit upload photo.jpg --public
```

## Log in

```bash
medialit login
```

Your browser opens to sign in. If you have more than one app, you choose the app the CLI works with. Run `medialit login` again to choose a different one.

For a self-hosted MediaLit, pass its URL once. Later commands use the server you last logged in to:

```bash
medialit login --endpoint https://medialit.example.com
```

Without a browser, for example over SSH, use `--no-browser` and open the printed URL on another device whose browser can reach this machine's `127.0.0.1`.

In CI, skip logging in and set `MEDIALIT_API_KEY` (and `MEDIALIT_ENDPOINT` if you self-host).

## Commands

| Command                    | What it does                                       |
| -------------------------- | -------------------------------------------------- |
| `medialit upload <files…>` | Uploads and seals files, then prints their URLs    |
| `medialit ls`              | Lists sealed files, newest first                   |
| `medialit get <id>`        | Prints a file's URL, a fresh one for private files |
| `medialit seal <id>`       | Keeps a temporary upload                           |
| `medialit rm <id>`         | Deletes a file                                     |
| `medialit settings`        | Shows the app's media settings                     |
| `medialit settings set`    | Changes the app's media settings                   |
| `medialit whoami`          | Shows the server, account, app and storage used    |
| `medialit logout`          | Logs out of the server                             |

Uploads are private unless you pass `--public`. Add `--caption <text>` or `--group <name>` to label them, or `--temp` to leave them unsealed so MediaLit deletes them after 24 hours. `--video-streaming <off|hls|mp4>` and `--captions <on|off>` on `upload` or `seal` override the app's settings for those files only. Large files are uploaded in chunks and retried if the connection drops.

`ls` takes `--public`, `--private`, `--group <name>`, `--page <n>` and `--limit <n>`.

### Media settings

```bash
medialit settings set --video-streaming hls --hls-renditions 1080p,720p,480p
medialit settings set --webp on --webp-quality 85
```

`settings set` changes only the options you pass; changes apply to files sealed afterwards. `--video-streaming` takes `off`, `hls` or `mp4`, and `--hls-renditions default` goes back to the default sizes. `--captions on` makes captions for sealed videos and audio files.

### Webhooks

Webhook endpoints are told when processing of sealed media finishes or fails. See [Webhooks](https://medialit.cloud/docs/webhooks).

| Command                          | What it does                                            |
| -------------------------------- | ------------------------------------------------------- |
| `medialit webhooks ls`           | Lists the app's endpoints                               |
| `medialit webhooks create <url>` | Adds an endpoint and prints its signing secret          |
| `medialit webhooks update <id>`  | Changes `--url`, `--events`, `--enable` or `--disable`  |
| `medialit webhooks rotate <id>`  | Replaces an endpoint's signing secret and prints it     |
| `medialit webhooks secret <id>`  | Prints an endpoint's signing secret                     |
| `medialit webhooks test <id>`    | Sends a signed test event and prints whether it arrived |
| `medialit webhooks rm <id>`      | Deletes an endpoint                                     |

`--events` takes a comma-separated list of `media.processing.ready` and `media.processing.failed`; endpoints get both by default.

Every command takes `--json`. URLs and JSON go to stdout and messages to stderr, so you can pipe the output:

```bash
medialit upload report.pdf --public | pbcopy
```

## Where your login is stored

In `~/.config/medialit/credentials.json` (`%APPDATA%\medialit` on Windows), readable only by you. Set `MEDIALIT_CONFIG_DIR` to use another folder.
