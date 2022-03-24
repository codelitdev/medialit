import ApikeyModel, { Apikey } from "../../models/apikey";
import { nanoid } from 'nanoid';
import logger from "../../services/log";
import { SUCCESS } from "../../config/strings";

export async function createApikey(req: any, res: any, next: (...args: any[]) => void) {
    try {
        const apikey: Apikey = await ApikeyModel.create({
            key: nanoid(),
            userId: req.user.id 
        })

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
        let result;
        const projections = {
            _id: 0,
            key: 1,
            httpReferrers: 1,
            ipAddresses: 1,
            createdAt: 1,
            updatedAt: 1
        }
        if (keyId) {
            result = await ApikeyModel.findOne({
                key: keyId,
                userId: req.user.id
            }, projections);
        } else {
            result = await ApikeyModel.find({ userId: req.user.id }, projections);
        }

        res.status(200).json({ result });
    } catch (err: any) {
        logger.error({ err }, err.message);
        res.status(500).json({ error: err.message });
    }
}

export async function deleteApikey(req: any, res: any, next: (...args: any[]) => void) {
    const { keyId } = req.params;

    try {
        const apikey = await ApikeyModel.findOne({
            key: keyId,
            userId: req.user.id 
        });

        if (apikey) {
            await apikey.delete();
        }

        res.status(200).json({ message: SUCCESS });
    } catch (err: any) {
        logger.error({ err }, err.message);
        res.status(500).json({ error: err.message });
    }
}