import { Request } from "express";
import Joi from "joi";
import logger from "../services/log";
import preSignedUrlService from "./service";

function validatePresigningOptions(req: Request): Joi.ValidationResult {
    const uploadSchema = Joi.object({
        group: Joi.string().optional(),
    });
    const { group } = req.body;
    return uploadSchema.validate({ group });
}

export async function getPresignedUrl(
    req: any,
    res: any,
    next: (...args: any[]) => void
) {
    const { error } = validatePresigningOptions(req);
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const presignedUrl = await preSignedUrlService.generateSignedUrl({
            userId: req.user.id,
            apikey: req.apikey,
            protocol: req.protocol,
            host: req.get("Host"),
            group: req.body.group,
        });
        return res.status(200).json({ message: presignedUrl });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json(err.message);
    }
}
