import express from "express";
import subscription from "../subscription/middleware";
import {
    getMediaSettingsHandler,
    updateMediaSettingsHandler,
} from "../media-settings/handlers";

export default (passport: any) => {
    const router = express.Router();

    router.post(
        "/create",
        passport.authenticate("jwt", { session: false }),
        subscription,
        updateMediaSettingsHandler
    );

    router.post(
        "/get",
        passport.authenticate("jwt", { session: false }),
        subscription,
        getMediaSettingsHandler
    );

    return router;
};
