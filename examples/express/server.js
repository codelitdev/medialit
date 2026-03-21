import express from "express";
import cors from "cors";
import multer from "multer";
import { readFile, unlink } from "node:fs/promises";
import { MediaLit } from "medialit";

const app = express();
const upload = multer({ dest: "uploads/" });
const client = new MediaLit();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

// Upload via server
app.post("/api/medialit/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "file is required" });
        }
        const apiKey = process.env.MEDIALIT_API_KEY;
        if (!apiKey) {
            return res
                .status(500)
                .json({ error: "MEDIALIT_API_KEY is missing" });
        }

        const bytes = await readFile(req.file.path);
        const formData = new FormData();
        formData.append(
            "file",
            new Blob([bytes], { type: req.file.mimetype }),
            req.file.originalname || req.file.filename,
        );
        formData.append(
            "access",
            req.body.access === "public" ? "public" : "private",
        );
        if (req.body.caption) {
            formData.append("caption", req.body.caption);
        }
        if (req.body.group) {
            formData.append("group", req.body.group);
        }

        const uploadResponse = await fetch(`${client.endpoint}/media/create`, {
            method: "POST",
            headers: {
                "x-medialit-apikey": apiKey,
            },
            body: formData,
        });
        const media = await uploadResponse.json();

        if (!uploadResponse.ok) {
            throw new Error(media.error || "Upload failed");
        }
        if (!media.mediaId) {
            throw new Error("Upload succeeded but mediaId is missing");
        }

        // Seal uploaded media so it persists and appears in list/get APIs.
        const sealedMedia = await client.seal(media.mediaId);

        // Cleanup temp file once uploaded.
        await unlink(req.file.path).catch(() => undefined);

        return res.json(sealedMedia);
    } catch (error) {
        return res.status(500).json({
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// List media
app.get("/api/medialit", async (req, res) => {
    try {
        const page = Number.parseInt(String(req.query.page ?? "1"), 10);
        const limit = Number.parseInt(String(req.query.limit ?? "10"), 10);
        const access = req.query.access;
        const group = req.query.group;

        const media = await client.list(page, limit, {
            access:
                access === "public" || access === "private"
                    ? access
                    : undefined,
            group: typeof group === "string" ? group : undefined,
        });

        return res.json(media);
    } catch (error) {
        return res.status(500).json({
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// Get media by id
app.get("/api/medialit/:id", async (req, res) => {
    try {
        const media = await client.get(req.params.id);
        return res.json(media);
    } catch (error) {
        return res.status(500).json({
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// Delete media
app.delete("/api/medialit/:id", async (req, res) => {
    try {
        await client.delete(req.params.id);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// Count media
app.get("/api/medialit/count", async (_req, res) => {
    try {
        const count = await client.getCount();
        return res.json({ count });
    } catch (error) {
        return res.status(500).json({
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// Optional: signature for browser direct upload
app.post("/api/medialit/signature", async (req, res) => {
    try {
        const signature = await client.getSignature({
            group: req.body.group,
        });

        return res.json({
            endpoint: client.endpoint,
            signature,
        });
    } catch (error) {
        return res.status(500).json({
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
