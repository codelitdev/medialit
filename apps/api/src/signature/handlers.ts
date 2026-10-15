import { Request } from "express";
import Joi from "joi";
import logger from "../services/log";
import * as preSignedUrlService from "./service";

/* Checks the options a signature can carry. Shared by the API-key route
   and the dashboard's session route. */
export function validatePresigningOptions(
    body: Request["body"],
): Joi.ValidationResult {
    const uploadSchema = Joi.object({
        group: Joi.string().optional(),
    });
    return uploadSchema.validate({ group: body?.group });
}

export async function getSignature(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const { error } = validatePresigningOptions(req.body);
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const signature = await preSignedUrlService.generateSignature({
            userId: req.user.id,
            apikey: req.apikey,
            group: req.body.group,
        });
        return res.status(200).json({ signature });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}
