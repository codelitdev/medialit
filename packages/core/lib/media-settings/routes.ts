import express from 'express';
import subscription from '../subscription/middleware';
import { updateMediaSettings } from '../media-settings/handlers';

export default (passport: any) => {
    const router = express.Router();

    router.post(
        "/",
        passport.authenticate("jwt", { session: false }),
        subscription,
        updateMediaSettings
    )

    return router;
}