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
    renameApiKey,
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
        const count = await getMediaCount({
            userId: owned.user.id,
            apikey: owned.key.key,
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
        const result = await mediaService.getPage({
            userId: owned.user.id,
            apikey: owned.key.key,
            page: Number.isFinite(page) ? page : 1,
            recordsPerPage: Number.isFinite(limit) ? limit : 10,
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
