import {
    Router,
    type NextFunction,
    type Request,
    type Response,
} from "express";
import { fromNodeHeaders } from "better-auth/node";
import rateLimit from "express-rate-limit";
import {
    createApiKey,
    findUserById,
    getApiKeyByKeyId,
    listApiKeys,
    listApiKeyMediaSummaries,
    renameApiKey,
    setDefaultApiKey,
    softDeleteApiKey,
    type AccountUser,
    type ApiKeyMediaSummary,
    type ApiKeyRecord,
} from "@/db";
import type { MedialitAuth } from "../auth/better-auth";
import {
    accountSubscription,
    maxStorageFor,
    resolveAccountBilling,
} from "../billing/entitlements";
import { deploymentMode } from "../billing/catalog";
import mediaService from "../media/service";
import { sealErrorStatus } from "../media/handlers";
import { mediaKind, parseMediaKind } from "../media/kind";
import { getMediaCount, getTotalSpace } from "../media/queries";
import { validatePresigningOptions } from "../signature/handlers";
import { generateSignature } from "../signature/service";
import logger from "../services/log";

function publicApp(row: ApiKeyRecord, includeSecret: boolean) {
    return {
        keyId: row.keyId,
        name: row.name,
        default: row.default,
        ...(includeSecret ? { key: row.key } : {}),
    };
}

/* Set by the session middleware below for every /api/account and /api/apps
   request, so handlers never resolve the session again. */
function currentUser(res: Response): AccountUser {
    return res.locals.user as AccountUser;
}

async function ownedApp(req: Request, res: Response) {
    const user = currentUser(res);
    const key = await getApiKeyByKeyId(user.id, String(req.params.keyId));
    if (!key) {
        res.status(404).json({ error: "Apikey not found" });
        return null;
    }
    return { user, key };
}

function catchAsync(
    handler: (req: Request, res: Response) => Promise<unknown>,
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve()
            .then(() => handler(req, res))
            .catch(next);
    };
}

const MAX_BULK_DELETE = 100;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 10;
const MAX_SEARCH_LENGTH = 200;

/* Reads a whole number from a query value. A missing value gives the
   fallback; anything else that isn't a whole number gives null. */
function queryInteger(value: unknown, fallback: number): number | null {
    if (value === undefined || value === "") return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
    return Number(value);
}

function querySearch(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const search = value.trim().slice(0, MAX_SEARCH_LENGTH);
    return search || undefined;
}

const MEDIA_SORTS = ["newest", "oldest", "name", "largest"] as const;
type MediaSort = (typeof MEDIA_SORTS)[number];

function parseMediaSort(value: unknown): MediaSort | undefined {
    return MEDIA_SORTS.find((sort) => sort === value);
}

function withKind<T extends { mimeType?: string }>(media: T) {
    return { ...media, kind: mediaKind(media.mimeType ?? "") };
}

type AppSummary = {
    keyId: string;
    name: string;
    default: boolean;
    count: number;
    storage: number;
    images: number;
    videos: number;
    pdfs: number;
    others: number;
    imageStorage: number;
    videoStorage: number;
    pdfStorage: number;
    otherStorage: number;
    lastUpload: Date | null;
    /** Percent of the account's storage, one decimal place. */
    share: number;
};

function summarizeApp(
    key: ApiKeyRecord,
    summary: ApiKeyMediaSummary | undefined,
) {
    return {
        keyId: key.keyId,
        name: key.name,
        default: key.default,
        count: summary?.count ?? 0,
        storage: summary?.storage ?? 0,
        images: summary?.images ?? 0,
        videos: summary?.videos ?? 0,
        pdfs: summary?.pdfs ?? 0,
        others: summary?.others ?? 0,
        imageStorage: summary?.imageStorage ?? 0,
        videoStorage: summary?.videoStorage ?? 0,
        pdfStorage: summary?.pdfStorage ?? 0,
        otherStorage: summary?.otherStorage ?? 0,
        lastUpload: summary?.lastUpload ?? null,
    };
}

/* Per-app usage for every app the user has, newest upload first, with each
   app's share of the account's storage. */
async function loadAppSummaries(userId: string) {
    const [keys, summaries] = await Promise.all([
        listApiKeys(userId),
        listApiKeyMediaSummaries(userId),
    ]);
    const summaryByKey = new Map(
        summaries.map((summary) => [summary.apikey, summary]),
    );
    const apps = keys.map((key) =>
        summarizeApp(key, summaryByKey.get(key.key)),
    );
    const totalStorage = apps.reduce((total, app) => total + app.storage, 0);
    const storageShare = (storage: number) => {
        if (!totalStorage) return 0;
        return Number(((storage / totalStorage) * 100).toFixed(1));
    };

    apps.sort((left, right) => {
        const leftUpload = left.lastUpload?.getTime() ?? 0;
        const rightUpload = right.lastUpload?.getTime() ?? 0;
        return rightUpload - leftUpload;
    });

    return apps.map(
        (app): AppSummary => ({ ...app, share: storageShare(app.storage) }),
    );
}

/* Dashboard budget per signed-in user. A person clicking through the UI makes
   far fewer calls than an integration, so this is separate from the API-key
   limit. Keyed by user, not IP, so users behind one NAT don't share a bucket. */
const dashboardLimiter = rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (_req, res) => `user:${currentUser(res).id}`,
    message: {
        error: "too_many_requests",
        error_description: "Too many requests.",
    },
});

export function createDashboardRouter(auth: MedialitAuth) {
    const router = Router();

    /* Resolve the session once, before the limiter so it can key on the
       user. Handlers read the user from res.locals. */
    router.use(
        ["/api/account", "/api/apps"],
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const session = await auth.auth.api.getSession({
                    headers: fromNodeHeaders(req.headers),
                });
                const user = session?.user?.id
                    ? await findUserById(session.user.id)
                    : null;
                if (!user) {
                    res.status(401).json({ error: "Unauthenticated" });
                    return;
                }
                res.locals.user = user;
                next();
            } catch (error) {
                next(error);
            }
        },
        dashboardLimiter,
    );
    for (const method of ["get", "post", "patch", "delete"] as const) {
        const original = router[method].bind(router);
        (router as any)[method] = (
            path: string,
            handler: (req: Request, res: Response) => Promise<unknown>,
        ) => original(path, catchAsync(handler));
    }

    router.get("/api/account", async (_req, res) => {
        const user = currentUser(res);
        const account = await resolveAccountBilling(user);
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            userId: user.userId,
            active: user.active,
            plan: account.plan,
            subscription: accountSubscription(account),
            deploymentMode: deploymentMode(),
        });
    });

    router.get("/api/apps", async (_req, res) => {
        const rows = await listApiKeys(currentUser(res).id);
        res.json(rows.map((row) => publicApp(row, false)));
    });

    // Session-only dashboard data; the public OpenAPI spec covers customer API routes.
    router.get("/api/apps/overview", async (_req, res) => {
        const apps = await loadAppSummaries(currentUser(res).id);
        const totals = apps.reduce(
            (result, app) => ({
                files: result.files + app.count,
                storage: result.storage + app.storage,
                images: result.images + app.images,
                videos: result.videos + app.videos,
                pdfs: result.pdfs + app.pdfs,
                others: result.others + app.others,
            }),
            { files: 0, storage: 0, images: 0, videos: 0, pdfs: 0, others: 0 },
        );
        const largest = apps.reduce<AppSummary | null>(
            (current, app) =>
                !current || app.storage > current.storage ? app : current,
            null,
        );

        res.json({
            apps,
            appCount: apps.length,
            totalFiles: totals.files,
            totalStorage: totals.storage,
            totalImages: totals.images,
            totalVideos: totals.videos,
            totalPdfs: totals.pdfs,
            totalOthers: totals.others,
            largestApp: largest
                ? {
                      keyId: largest.keyId,
                      name: largest.name,
                      storage: largest.storage,
                      share: largest.share,
                  }
                : null,
        });
    });

    router.post("/api/apps", async (req, res) => {
        const name = String(req.body?.name || "").trim();
        if (!name) {
            res.status(400).json({ error: "Name is required" });
            return;
        }
        try {
            const created = await createApiKey({
                userId: currentUser(res).id,
                name,
            });
            res.status(201).json({
                key: created.key,
                keyId: created.keyId,
                name: created.name,
            });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    router.get("/api/apps/:keyId/summary", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const apps = await loadAppSummaries(owned.user.id);
        const app = apps.find((summary) => summary.keyId === owned.key.keyId);
        if (!app) {
            res.status(404).json({ error: "Apikey not found" });
            return;
        }
        res.json(app);
    });

    router.get("/api/apps/:keyId/media/count", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const count = await getMediaCount({
            userId: owned.user.id,
            apikey: owned.key.key,
            search: querySearch(req.query.search),
            kind: parseMediaKind(req.query.kind),
        });
        res.json({ count });
    });

    router.get("/api/apps/:keyId/stats", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const storage = await getTotalSpace({
            userId: owned.user.id,
            apikey: owned.key.key,
        });
        res.json({
            storage,
            maxStorage: await maxStorageFor(owned.user),
        });
    });

    /* A signature for one browser (or app) upload to this app. The client
       uploads straight to `endpoint` with it, then seals the result below. */
    router.post("/api/apps/:keyId/media/signature", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const { error } = validatePresigningOptions(req.body);
        if (error) {
            res.status(400).json({ error: error.message });
            return;
        }
        const signature = await generateSignature({
            userId: owned.user.id,
            apikey: owned.key.key,
            group: req.body?.group,
        });
        res.json({ signature, endpoint: auth.publicApiUrl });
    });

    router.post("/api/apps/:keyId/media/:mediaId/seal", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        try {
            const media = await mediaService.sealMedia({
                userId: owned.user.id,
                apikey: owned.key.key,
                mediaId: String(req.params.mediaId),
            });
            res.json(withKind(media));
        } catch (err: any) {
            const status = sealErrorStatus(err);
            if (status === 500) logger.error({ err }, err.message);
            res.status(status).json({ error: err.message });
        }
    });

    router.get("/api/apps/:keyId/media/:mediaId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const media = await mediaService.getMediaDetails({
            userId: owned.user.id,
            apikey: owned.key.key,
            mediaId: String(req.params.mediaId),
        });
        if (!media) {
            res.status(404).json({ error: "Not found" });
            return;
        }
        res.json(withKind(media));
    });

    router.delete("/api/apps/:keyId/media/:mediaId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        await mediaService.deleteMedia({
            userId: owned.user.id,
            apikey: owned.key.key,
            mediaId: String(req.params.mediaId),
        });
        res.json({ message: "success" });
    });

    router.post("/api/apps/:keyId/media/delete", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const mediaIds = req.body?.mediaIds;
        if (
            !Array.isArray(mediaIds) ||
            mediaIds.length === 0 ||
            mediaIds.length > MAX_BULK_DELETE ||
            !mediaIds.every((id) => typeof id === "string" && id.length > 0)
        ) {
            res.status(400).json({
                error: `mediaIds must be between 1 and ${MAX_BULK_DELETE} ids`,
            });
            return;
        }
        const result = await mediaService.deleteMediaMany({
            userId: owned.user.id,
            apikey: owned.key.key,
            mediaIds,
        });
        res.json(result);
    });

    router.get("/api/apps/:keyId/media", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const page = queryInteger(req.query.page, 1);
        if (page === null || page < 1) {
            res.status(400).json({
                error: "page must be a whole number from 1",
            });
            return;
        }
        const limit = queryInteger(req.query.limit, DEFAULT_PAGE_SIZE);
        if (limit === null || limit < 1 || limit > MAX_PAGE_SIZE) {
            res.status(400).json({
                error: `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`,
            });
            return;
        }
        const result = await mediaService.getPage({
            userId: owned.user.id,
            apikey: owned.key.key,
            page,
            recordsPerPage: limit,
            search: querySearch(req.query.search),
            kind: parseMediaKind(req.query.kind),
            sort: parseMediaSort(req.query.sort),
        });
        res.json(result.map(withKind));
    });

    router.get("/api/apps/:keyId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        res.json(publicApp(owned.key, true));
    });

    router.patch("/api/apps/:keyId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const name = String(req.body?.name || "").trim();
        if (!name) {
            res.status(400).json({ error: "Name is required" });
            return;
        }
        try {
            await renameApiKey({
                userId: owned.user.id,
                keyId: owned.key.keyId,
                newName: name,
            });
            res.json({ success: true });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    router.patch("/api/apps/:keyId/default", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        try {
            await setDefaultApiKey(owned.user.id, owned.key.keyId);
            res.json({ success: true });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    router.delete("/api/apps/:keyId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        try {
            await softDeleteApiKey(owned.user.id, owned.key.keyId);
            res.json({ success: true });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    return router;
}
