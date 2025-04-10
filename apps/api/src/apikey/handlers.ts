import logger from "../services/log";
import { NOT_FOUND, SUCCESS } from "../config/strings";
import queries, { deleteApiKey, getApiKeyByUserId } from "./queries";
import { Apikey } from "@medialit/models";

export async function createApikey(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: "Name is required" });
    }

    try {
        const apikey: Apikey = await queries.createApiKey(req.user.id, name);

        return res.status(200).json({
            key: apikey.key,
        });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function getApikey(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const { keyId } = req.params;

    try {
        const apikey = await getApiKeyByUserId(req.user.id, keyId);

        if (!apikey) {
            return res.status(404).json({ error: NOT_FOUND });
        }
        res.status(200).json(apikey);
    } catch (err: any) {
        logger.error({ err }, err.message);
        res.status(500).json({ error: err.message });
    }
}

export async function deleteApikey(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const { keyId } = req.params;

    try {
        await deleteApiKey(req.user.id, keyId);
        res.status(200).json({ message: SUCCESS });
    } catch (err: any) {
        logger.error({ err }, err.message);
        res.status(500).json({ error: err.message });
    }
}
