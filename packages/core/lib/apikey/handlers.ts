import { Apikey } from "./model";
import logger from "../services/log";
import { SUCCESS } from "../config/strings";
import { createApiKey, deleteApiKey, getApiKey } from "./queries";

export async function createApikey(req: any, res: any, next: (...args: any[]) => void) {
    try {
        const apikey: Apikey = await createApiKey(req.user.id);

        res.status(200).json({
            key: apikey.key
        });
    } catch (err: any) {
        logger.error({ err }, err.message);
        res.status(500).json({ error: err.message });
    }
}

export async function getApikey(req: any, res: any, next: (...args: any[]) => void) {
    const { keyId } = req.params;

    try {
        const apikey = await getApiKey(req.user.id, keyId);
        res.status(200).json(apikey);
    } catch (err: any) {
        logger.error({ err }, err.message);
        res.status(500).json({ error: err.message });
    }
}

export async function deleteApikey(req: any, res: any, next: (...args: any[]) => void) {
    const { keyId } = req.params;

    try {
        await deleteApiKey(req.user.id, keyId);
        res.status(200).json({ message: SUCCESS });
    } catch (err: any) {
        logger.error({ err }, err.message);
        res.status(500).json({ error: err.message });
    }
}