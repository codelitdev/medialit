import { Request } from "express";
import Joi from "joi";
import logger from "../services/log";
import * as preSignedUrlService from "./service";
import { HOSTNAME_OVERRIDE } from "../config/constants";

function validatePresigningOptions(req: Request): Joi.ValidationResult {
    const uploadSchema = Joi.object({
        group: Joi.string().optional(),
    });
    const { group } = req.body;
    return uploadSchema.validate({ group });
}

export async function getSignature(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const { error } = validatePresigningOptions(req);
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const signature = await preSignedUrlService.generateSignature({
            userId: req.user.id,
            apikey: req.apikey,
            protocol: req.protocol,
            host: HOSTNAME_OVERRIDE || req.get("Host"),
            group: req.body.group,
        });
        return res.status(200).json({ signature });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json(err.message);
    }
}
