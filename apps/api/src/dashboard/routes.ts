import {
    Router,
    type NextFunction,
    type Request,
    type Response,
} from "express";
import { fromNodeHeaders } from "better-auth/node";
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
import { getMediaCount, getTotalSpace } from "../media/queries";

function publicApp(row: ApiKeyRecord, includeSecret: boolean) {
    return {
        keyId: row.keyId,
        name: row.name,
        default: row.default,
        ...(includeSecret ? { key: row.key } : {}),
    };
}

async function sessionUser(
    auth: MedialitAuth,
    req: Request,
    res: Response,
): Promise<AccountUser | null> {
    const session = await auth.auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user?.id) {
        res.status(401).json({ error: "Unauthenticated" });
        return null;
    }
    const user = await findUserById(session.user.id);
    if (!user) {
        res.status(401).json({ error: "Unauthenticated" });
        return null;
    }
    return user;
}

async function ownedApp(auth: MedialitAuth, req: Request, res: Response) {
    const user = await sessionUser(auth, req, res);
    if (!user) return null;
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

export function createDashboardRouter(auth: MedialitAuth) {
    const router = Router();
    for (const method of ["get", "post", "patch", "delete"] as const) {
        const original = router[method].bind(router);
        (router as any)[method] = (
            path: string,
            handler: (req: Request, res: Response) => Promise<unknown>,
        ) => original(path, catchAsync(handler));
    }

    router.get("/api/account", async (req, res) => {
        const user = await sessionUser(auth, req, res);
        if (!user) return;
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

    router.get("/api/apps", async (req, res) => {
        const user = await sessionUser(auth, req, res);
        if (!user) return;
        const rows = await listApiKeys(user.id);
        res.json(rows.map((row) => publicApp(row, false)));
    });

    // Session-only dashboard data; the public OpenAPI spec covers customer API routes.
    router.get("/api/apps/overview", async (req, res) => {
        const user = await sessionUser(auth, req, res);
        if (!user) return;

        const [keys, summaries] = await Promise.all([
            listApiKeys(user.id),
            listApiKeyMediaSummaries(user.id),
        ]);
        const summaryByKey = new Map(
            summaries.map((summary) => [summary.apikey, summary]),
        );
        const apps = keys.map((key) => {
            const summary = summaryByKey.get(key.key);
            return {
                keyId: key.keyId,
                name: key.name,
                default: key.default,
                count: summary?.count ?? 0,
                storage: summary?.storage ?? 0,
                images: summary?.images ?? 0,
                videos: summary?.videos ?? 0,
                pdfs: summary?.pdfs ?? 0,
                imageStorage: summary?.imageStorage ?? 0,
                videoStorage: summary?.videoStorage ?? 0,
                pdfStorage: summary?.pdfStorage ?? 0,
                otherStorage: summary?.otherStorage ?? 0,
                lastUpload: summary?.lastUpload ?? null,
            };
        });
        const totals = apps.reduce(
            (result, app) => ({
                files: result.files + app.count,
                storage: result.storage + app.storage,
                images: result.images + app.images,
                videos: result.videos + app.videos,
                pdfs: result.pdfs + app.pdfs,
            }),
            { files: 0, storage: 0, images: 0, videos: 0, pdfs: 0 },
        );
        const storageShare = (storage: number) => {
            if (!totals.storage) return 0;
            return Number(((storage / totals.storage) * 100).toFixed(1));
        };
        const largest = apps.reduce<(typeof apps)[number] | null>(
            (current, app) =>
                !current || app.storage > current.storage ? app : current,
            null,
        );

        apps.sort((left, right) => {
            const leftUpload = left.lastUpload?.getTime() ?? 0;
            const rightUpload = right.lastUpload?.getTime() ?? 0;
            return rightUpload - leftUpload;
        });

        res.json({
            apps: apps.map((app) => ({
                ...app,
                share: storageShare(app.storage),
            })),
            appCount: apps.length,
            totalFiles: totals.files,
            totalStorage: totals.storage,
            totalImages: totals.images,
            totalVideos: totals.videos,
            totalPdfs: totals.pdfs,
            largestApp: largest
                ? {
                      keyId: largest.keyId,
                      name: largest.name,
                      storage: largest.storage,
                      share: storageShare(largest.storage),
                  }
                : null,
        });
    });

    router.post("/api/apps", async (req, res) => {
        const user = await sessionUser(auth, req, res);
        if (!user) return;
        const name = String(req.body?.name || "").trim();
        if (!name) {
            res.status(400).json({ error: "Name is required" });
            return;
        }
        try {
            const created = await createApiKey({ userId: user.id, name });
            res.status(201).json({
                key: created.key,
                keyId: created.keyId,
                name: created.name,
            });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    router.get("/api/apps/:keyId/media/count", async (req, res) => {
        const owned = await ownedApp(auth, req, res);
        if (!owned) return;
        const kind = ["image", "video", "pdf", "other"].includes(
            String(req.query.kind),
        )
            ? (String(req.query.kind) as "image" | "video" | "pdf" | "other")
            : undefined;
        const count = await getMediaCount({
            userId: owned.user.id,
            apikey: owned.key.key,
            search:
                typeof req.query.search === "string"
                    ? req.query.search
                    : undefined,
            kind,
        });
        res.json({ count });
    });

    router.get("/api/apps/:keyId/stats", async (req, res) => {
        const owned = await ownedApp(auth, req, res);
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

    router.get("/api/apps/:keyId/media/:mediaId", async (req, res) => {
        const owned = await ownedApp(auth, req, res);
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
        res.json(media);
    });

    router.get("/api/apps/:keyId/media", async (req, res) => {
        const owned = await ownedApp(auth, req, res);
        if (!owned) return;
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 10);
        const kind = ["image", "video", "pdf", "other"].includes(
            String(req.query.kind),
        )
            ? (String(req.query.kind) as "image" | "video" | "pdf" | "other")
            : undefined;
        const sort = ["newest", "oldest", "name", "largest"].includes(
            String(req.query.sort),
        )
            ? (String(req.query.sort) as
                  | "newest"
                  | "oldest"
                  | "name"
                  | "largest")
            : undefined;
        const result = await mediaService.getPage({
            userId: owned.user.id,
            apikey: owned.key.key,
            page: Number.isFinite(page) ? page : 1,
            recordsPerPage: Number.isFinite(limit) ? limit : 10,
            search:
                typeof req.query.search === "string"
                    ? req.query.search
                    : undefined,
            kind,
            sort,
        });
        res.json(result);
    });

    router.get("/api/apps/:keyId", async (req, res) => {
        const owned = await ownedApp(auth, req, res);
        if (!owned) return;
        res.json(publicApp(owned.key, true));
    });

    router.patch("/api/apps/:keyId", async (req, res) => {
        const owned = await ownedApp(auth, req, res);
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
        const owned = await ownedApp(auth, req, res);
        if (!owned) return;
        try {
            await setDefaultApiKey(owned.user.id, owned.key.keyId);
            res.json({ success: true });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    router.delete("/api/apps/:keyId", async (req, res) => {
        const owned = await ownedApp(auth, req, res);
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
