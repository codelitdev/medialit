import {
    Router,
    type NextFunction,
    type Request,
    type Response,
} from "express";
import { fromNodeHeaders } from "better-auth/node";
import rateLimit from "express-rate-limit";
import {
    ApiKeyLimitError,
    createApp,
    findUserById,
    getAppByPublicId,
    listActiveApiKeys,
    listAppMediaSummaries,
    listApps,
    renameApp,
    revokeApiKey,
    setDefaultApp,
    softDeleteApp,
    type AccountUser,
    type ApiKeyRecord,
    type AppMediaSummary,
    type AppRecord,
} from "@/db";
import type { ApiKey } from "@medialit/models";
import { createApiKey } from "../apikey/queries";
import { configuredBootstrapKeyHash } from "../apikey/bootstrap-config";
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

function publicApp(row: AppRecord) {
    return {
        appId: row.appId,
        name: row.name,
        default: row.default,
    };
}

/** A key as the dashboard sees it: public ID and display prefix only. */
function publicApiKey(
    row: ApiKeyRecord,
    bootstrapKeyHash: string | null,
): ApiKey {
    return {
        keyId: row.apiKeyId,
        name: row.name,
        keyPrefix: row.keyPrefix,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        managedByConfiguration: row.keyHash === bootstrapKeyHash,
    };
}

const MAX_KEY_NAME_LENGTH = 100;

/* Validates a new key's body. `expiresAt` is optional; when given it must be
   a future ISO date. */
function parseNewKey(
    body: any,
): { name: string; expiresAt?: Date } | { error: string } {
    const name = String(body?.name ?? "").trim();
    if (!name) return { error: "Name is required" };
    if (name.length > MAX_KEY_NAME_LENGTH) {
        return {
            error: `Name must be at most ${MAX_KEY_NAME_LENGTH} characters`,
        };
    }
    if (body?.expiresAt === undefined || body?.expiresAt === null) {
        return { name };
    }
    const expiresAt =
        typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
        return { error: "expiresAt must be an ISO 8601 date" };
    }
    if (expiresAt.getTime() <= Date.now()) {
        return { error: "expiresAt must be in the future" };
    }
    return { name, expiresAt };
}

/* An audit line for key changes. Never logs a secret. */
function logApiKeyEvent(
    message: string,
    user: AccountUser,
    app: AppRecord,
    key: ApiKeyRecord,
) {
    logger.info(
        {
            userId: user.id,
            appId: app.appId,
            keyId: key.apiKeyId,
            keyPrefix: key.keyPrefix,
        },
        message,
    );
}

/* Set by the session middleware below for every /api/account and /api/apps
   request, so handlers never resolve the session again. */
function currentUser(res: Response): AccountUser {
    return res.locals.user as AccountUser;
}

async function ownedApp(req: Request, res: Response) {
    const user = currentUser(res);
    const app = await getAppByPublicId(user.id, String(req.params.appId));
    if (!app) {
        res.status(404).json({ error: "App not found" });
        return null;
    }
    return { user, app };
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
    appId: string;
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

function summarizeApp(app: AppRecord, summary: AppMediaSummary | undefined) {
    return {
        appId: app.appId,
        name: app.name,
        default: app.default,
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
    const [rows, summaries] = await Promise.all([
        listApps(userId),
        listAppMediaSummaries(userId),
    ]);
    const summaryByApp = new Map(
        summaries.map((summary) => [summary.appId, summary]),
    );
    const apps = rows.map((app) => summarizeApp(app, summaryByApp.get(app.id)));
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
        const rows = await listApps(currentUser(res).id);
        res.json(rows.map(publicApp));
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
                      appId: largest.appId,
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
        const user = currentUser(res);
        let app: AppRecord;
        try {
            app = await createApp({ userId: user.id, name });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
            return;
        }
        // The first key comes with the app; its secret is only shown now.
        const { apiKey, secret } = await createApiKey({
            appId: app.id,
            name: "Default key",
            createdById: user.id,
        });
        logApiKeyEvent("API key created", user, app, apiKey);
        res.status(201).json({
            ...publicApp(app),
            key: secret,
            apiKey: publicApiKey(apiKey, null),
        });
    });

    router.get("/api/apps/:appId/summary", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const apps = await loadAppSummaries(owned.user.id);
        const app = apps.find((summary) => summary.appId === owned.app.appId);
        if (!app) {
            res.status(404).json({ error: "App not found" });
            return;
        }
        res.json(app);
    });

    router.get("/api/apps/:appId/media/count", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const count = await getMediaCount({
            userId: owned.user.id,
            appId: owned.app.id,
            search: querySearch(req.query.search),
            kind: parseMediaKind(req.query.kind),
        });
        res.json({ count });
    });

    router.get("/api/apps/:appId/stats", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const storage = await getTotalSpace({
            userId: owned.user.id,
            appId: owned.app.id,
        });
        res.json({
            storage,
            maxStorage: await maxStorageFor(owned.user),
        });
    });

    /* A signature for one browser (or app) upload to this app. The client
       uploads straight to `endpoint` with it, then seals the result below. */
    router.post("/api/apps/:appId/media/signature", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const { error } = validatePresigningOptions(req.body);
        if (error) {
            res.status(400).json({ error: error.message });
            return;
        }
        const signature = await generateSignature({
            userId: owned.user.id,
            appId: owned.app.id,
            group: req.body?.group,
        });
        res.json({ signature, endpoint: auth.publicApiUrl });
    });

    router.post("/api/apps/:appId/media/:mediaId/seal", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        try {
            const media = await mediaService.sealMedia({
                userId: owned.user.id,
                appId: owned.app.id,
                mediaId: String(req.params.mediaId),
            });
            res.json(withKind(media));
        } catch (err: any) {
            const status = sealErrorStatus(err);
            if (status === 500) logger.error({ err }, err.message);
            res.status(status).json({ error: err.message });
        }
    });

    router.get("/api/apps/:appId/media/:mediaId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const media = await mediaService.getMediaDetails({
            userId: owned.user.id,
            appId: owned.app.id,
            mediaId: String(req.params.mediaId),
        });
        if (!media) {
            res.status(404).json({ error: "Not found" });
            return;
        }
        res.json(withKind(media));
    });

    router.delete("/api/apps/:appId/media/:mediaId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        await mediaService.deleteMedia({
            userId: owned.user.id,
            appId: owned.app.id,
            mediaId: String(req.params.mediaId),
        });
        res.json({ message: "success" });
    });

    router.post("/api/apps/:appId/media/delete", async (req, res) => {
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
            appId: owned.app.id,
            mediaIds,
        });
        res.json(result);
    });

    router.get("/api/apps/:appId/media", async (req, res) => {
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
            appId: owned.app.id,
            page,
            recordsPerPage: limit,
            search: querySearch(req.query.search),
            kind: parseMediaKind(req.query.kind),
            sort: parseMediaSort(req.query.sort),
        });
        res.json(result.map(withKind));
    });

    router.get("/api/apps/:appId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        res.json(publicApp(owned.app));
    });

    router.get("/api/apps/:appId/keys", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const bootstrapKeyHash = configuredBootstrapKeyHash();
        const keys = await listActiveApiKeys(owned.app.id);
        res.json({
            items: keys.map((key) => publicApiKey(key, bootstrapKeyHash)),
        });
    });

    router.post("/api/apps/:appId/keys", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const input = parseNewKey(req.body);
        if ("error" in input) {
            res.status(400).json({ error: input.error });
            return;
        }
        try {
            const { apiKey, secret } = await createApiKey({
                appId: owned.app.id,
                name: input.name,
                createdById: owned.user.id,
                expiresAt: input.expiresAt,
            });
            logApiKeyEvent("API key created", owned.user, owned.app, apiKey);
            res.status(201).json({
                ...publicApiKey(apiKey, configuredBootstrapKeyHash()),
                key: secret,
            });
        } catch (error) {
            if (error instanceof ApiKeyLimitError) {
                res.status(409).json({
                    error: "api_key_limit_reached",
                    error_description: error.message,
                });
                return;
            }
            throw error;
        }
    });

    router.delete("/api/apps/:appId/keys/:keyId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const keyId = String(req.params.keyId);
        const keys = await listActiveApiKeys(owned.app.id);
        const key = keys.find((candidate) => candidate.apiKeyId === keyId);
        if (!key) {
            res.status(404).json({ error: "API key not found" });
            return;
        }
        // Revoking it would only last until the next restart revives it.
        if (key.keyHash === configuredBootstrapKeyHash()) {
            res.status(409).json({
                error: "managed_by_configuration",
                error_description:
                    "This key is set by MEDIALIT_BOOTSTRAP_API_KEY. Change or remove that setting to rotate it.",
            });
            return;
        }
        if (!(await revokeApiKey(owned.app.id, keyId))) {
            res.status(404).json({ error: "API key not found" });
            return;
        }
        logApiKeyEvent("API key revoked", owned.user, owned.app, key);
        res.status(204).end();
    });

    router.patch("/api/apps/:appId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        const name = String(req.body?.name || "").trim();
        if (!name) {
            res.status(400).json({ error: "Name is required" });
            return;
        }
        try {
            await renameApp({
                userId: owned.user.id,
                appId: owned.app.appId,
                newName: name,
            });
            res.json({ success: true });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    router.patch("/api/apps/:appId/default", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        try {
            await setDefaultApp(owned.user.id, owned.app.appId);
            res.json({ success: true });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    router.delete("/api/apps/:appId", async (req, res) => {
        const owned = await ownedApp(req, res);
        if (!owned) return;
        try {
            await softDeleteApp(owned.user.id, owned.app.appId);
            res.json({ success: true });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    return router;
}
