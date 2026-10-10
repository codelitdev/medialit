---
title: Express
slug: express-js
nav_order: 40
---

There are two ways to get files into MediaLit from an Express app:

- **Your server uploads.** The browser sends the file to your server, which passes it on to MediaLit. This is simplest for small files and for files your server creates.
- **The browser uploads.** Your server hands out a short-lived signature and the browser sends the file straight to MediaLit. Large files don't pass through your server, and dropped connections resume.

A runnable app is in [examples/express](https://github.com/codelitdev/medialit/tree/main/examples/express).

## Set up

```bash
npm install express multer medialit
```

```bash
MEDIALIT_API_KEY=your_api_key
# Only if you self-host MediaLit
# MEDIALIT_ENDPOINT=https://medialit.example.com
```

```js
const app = express();
app.use(express.json());

const medialit = new MediaLit(); // reads MEDIALIT_API_KEY
const upload = multer({ dest: "uploads/" });
```

## Upload from your server

```js
app.post("/photos", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    try {
        const media = await medialit.upload(req.file.path, {
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            access: "public",
        });
        // Your server decided to keep the file, so seal it right away.
        const sealed = await medialit.seal(media.mediaId);
        // Save sealed.mediaId and sealed.file in your database.
        res.json(sealed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        await unlink(req.file.path).catch(() => {});
    }
});
```

Try it:

```bash
curl -F "file=@photo.jpg" http://localhost:4000/photos
```

## Let browsers upload

Add a route that gives signed-in users an upload signature:

```js
app.post("/api/medialit/signature", requireUser, async (req, res) => {
    try {
        const signature = await medialit.getSignature({
            group: req.user.id, // optional
        });
        res.json({ signature, endpoint: medialit.endpoint });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

`requireUser` stands for your app's authentication middleware. Anyone who can call this route can upload to your MediaLit app.

In the browser, use [`@medialit/react`](/docs/react) or [`@medialit/uploader`](/docs/other-frameworks) with `signatureEndpoint: "/api/medialit/signature"`. When the user saves, send the `mediaId` to your server and seal it:

```js
app.post("/profile/avatar", requireUser, async (req, res) => {
    const media = await medialit.seal(req.body.mediaId);
    // Save media.mediaId and media.file with the user's profile.
    res.json(media);
});
```

Files that are never sealed are deleted after 24 hours. See [sealing](/docs/concepts#temporary-uploads-and-sealing).

## List, get and delete

```js
app.get("/photos", async (req, res) => {
    const page = Number(req.query.page ?? 1);
    res.json(await medialit.list(page, 20, { access: "public" }));
});

app.get("/photos/:id", async (req, res) => {
    // Private files get a fresh signed URL each time.
    res.json(await medialit.get(req.params.id));
});

app.delete("/photos/:id", async (req, res) => {
    await medialit.delete(req.params.id);
    res.status(204).end();
});

app.listen(4000);
```

Run the server with `node --env-file=.env server.js`. See the [Node.js SDK](/docs/node-sdk) for every method.
