import { Request } from "express";
import Joi from "joi";
import logger from "../services/log";
import * as preSignedUrlService from "./service";
import { HOSTNAME_OVERRIDE } from "../config/constants";

function validatePresigningOptions(req: Request): Joi.ValidationResult {
    const uploadSchema = Joi.object({
        group: Joi.string().optional(),
        chunked: Joi.boolean().optional(),
    });
    const { group, chunked } = req.body;
    return uploadSchema.validate({ group, chunked });
}

export async function getPresignedUrl(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const { error } = validatePresigningOptions(req);
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        // Use 24 hours (1440 minutes) validity for chunked uploads, default (5 minutes) for regular uploads
        const validityMinutes = req.body.chunked ? 1440 : undefined;
        
        const presignedUrl = await preSignedUrlService.generateSignedUrl({
            userId: req.user.id,
            apikey: req.apikey,
            protocol: req.protocol,
            host: HOSTNAME_OVERRIDE || req.get("Host"),
            group: req.body.group,
            validityMinutes,
        });
        return res.status(200).json({ message: presignedUrl });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json(err.message);
    }
}
