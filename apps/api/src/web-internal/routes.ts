import crypto from "node:crypto";
import express, {
    type NextFunction,
    type Request,
    type Response,
} from "express";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { resolveBetterAuthSession } from "@codelitdev/oauth-server-kit/better-auth";
import { createApiKey } from "../apikey/queries";
import { authIssuer, getAuth } from "../auth/better-auth";
import getRepositories from "../config/repositories";

const router = express.Router();

type WebRequest = Request & { webUserId?: string };

function serviceSecretMatches(value: unknown): boolean {
    const expected = process.env.WEB_INTERNAL_API_SECRET;
    if (
        !expected ||
        Buffer.byteLength(expected, "utf8") < 32 ||
        typeof value !== "string"
    ) {
        return false;
    }

    const actualBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);
    return (
        actualBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    );
}

async function requireWebUser(
    req: WebRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const auth = await resolveBetterAuthSession(
        { auth: getAuth(), issuer: authIssuer },
        fromNodeHeaders(req.headers),
    );
    if (auth.status !== "authenticated" || auth.identity.method !== "session") {
        res.status(401).json({ error: "Authentication is required" });
        return;
    }

    req.webUserId = auth.identity.subject;
    next();
}

function requireServiceSecret(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (!serviceSecretMatches(req.headers["x-medialit-internal-secret"])) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
}

function currentUserId(req: WebRequest): string {
    if (!req.webUserId) throw new Error("Web user is not authenticated");
    return req.webUserId;
}

router.get("/user", requireWebUser, async (req: WebRequest, res: Response) => {
    const user = await getRepositories().users.findById(currentUserId(req));
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(user);
});

router.get(
    "/apikeys",
    requireWebUser,
    async (req: WebRequest, res: Response) => {
        return res.json(
            await getRepositories().apikeys.findPublicManyByUserId(
                currentUserId(req),
            ),
        );
    },
);

router.get(
    "/apikeys/:keyId",
    requireWebUser,
    async (req: WebRequest, res: Response) => {
        const key = await getRepositories().apikeys.findByUserIdAndKeyId(
            currentUserId(req),
            req.params.keyId,
            { excludeDeleted: true },
        );
        if (!key) return res.status(404).json({ error: "Apikey not found" });
        return res.json(key);
    },
);

router.post(
    "/apikeys",
    requireWebUser,
    async (req: WebRequest, res: Response) => {
        const parsed = z
            .object({ name: z.string().min(1) })
            .safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Name is required" });
        }
        return res
            .status(201)
            .json(await createApiKey(currentUserId(req), parsed.data.name));
    },
);

router.patch(
    "/apikeys/:keyId",
    requireWebUser,
    async (req: WebRequest, res: Response) => {
        const parsed = z
            .object({ name: z.string().min(1) })
            .safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Name is required" });
        }
        const userId = currentUserId(req);
        const key = await getRepositories().apikeys.findByUserIdAndKeyId(
            userId,
            req.params.keyId,
            { excludeDeleted: true },
        );
        if (!key) return res.status(404).json({ error: "Apikey not found" });
        await getRepositories().apikeys.renameByUserIdAndKeyId(
            userId,
            req.params.keyId,
            parsed.data.name,
        );
        return res.status(204).end();
    },
);

router.delete(
    "/apikeys/:keyId",
    requireWebUser,
    async (req: WebRequest, res: Response) => {
        const userId = currentUserId(req);
        const key = await getRepositories().apikeys.findByUserIdAndKeyId(
            userId,
            req.params.keyId,
            { excludeDeleted: true },
        );
        if (!key) return res.status(404).json({ error: "Apikey not found" });
        if (key.default) {
            return res
                .status(400)
                .json({ error: "Default API key cannot be deleted" });
        }
        await getRepositories().apikeys.softDelete(userId, req.params.keyId);
        return res.status(204).end();
    },
);

router.post(
    "/logs",
    requireServiceSecret,
    async (req: Request, res: Response) => {
        const parsed = z
            .object({
                severity: z.enum(["info", "warn", "error"]),
                message: z.string().min(1),
                metadata: z.unknown().optional(),
            })
            .safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: "Bad request" });
        await getRepositories().logs.create(parsed.data);
        return res.status(204).end();
    },
);

router.post(
    "/subscriptions",
    requireServiceSecret,
    async (req: Request, res: Response) => {
        const parsed = z
            .object({
                userId: z.string().min(1),
                subscriptionStatus: z.enum([
                    "not-subscribed",
                    "subscribed",
                    "cancelled",
                    "paused",
                    "expired",
                ]),
                subscriptionEndsAfter: z.string().datetime().nullable(),
                subscriptionMethod: z.enum(["stripe", "lemon"]).optional(),
                customerId: z.string().optional(),
                subscriptionId: z.string().optional(),
            })
            .safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: "Bad request" });

        const user = await getRepositories().users.findByUserId(
            parsed.data.userId,
        );
        if (!user) return res.status(404).json({ error: "User not found" });

        const {
            userId: _userId,
            subscriptionEndsAfter,
            ...update
        } = parsed.data;
        await getRepositories().users.updateSubscription(user.id, {
            ...update,
            subscriptionEndsAfter: subscriptionEndsAfter
                ? new Date(subscriptionEndsAfter)
                : null,
        });
        return res.status(204).end();
    },
);

export default router;
