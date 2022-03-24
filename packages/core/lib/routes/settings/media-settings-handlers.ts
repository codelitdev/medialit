import Joi from 'joi';
import { SUCCESS } from '../../config/strings';
import MediaSettingsModel from '../../models/media-settings';

export async function updateMediaSettings(req: any, res: any, next: (...args: any[]) => void) {
    const mediaSettingsSchema = Joi.object({
        useWebP: Joi.boolean(),
        webpOutputQuality: Joi.number().integer(),
        thumbnailWidth: Joi.number().integer(),
        thumbnailHeight: Joi.number().integer()
    })

    const {
        useWebP,
        webpOutputQuality,
        thumbnailWidth,
        thumbnailHeight
    } = req.body;

    const { error, value } = mediaSettingsSchema.validate({
        useWebP,
        webpOutputQuality,
        thumbnailWidth,
        thumbnailHeight
    });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    await MediaSettingsModel.findOneAndUpdate(
        { userId: req.user.id},
        { $set: {
                useWebP,
                webpOutputQuality,
                thumbnailWidth,
                thumbnailHeight
            } 
        },
        { upsert: true }
    );

    res.status(200).json({ message: SUCCESS });
}