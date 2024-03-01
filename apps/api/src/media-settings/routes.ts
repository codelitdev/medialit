import express from "express";
import {
    getMediaSettingsHandler,
    updateMediaSettingsHandler,
} from "./handlers";
import apikey from "../apikey/middleware";

export default (passport: any) => {
    const router = express.Router();

    router.post("/create", apikey, updateMediaSettingsHandler);

    router.post("/get", apikey, getMediaSettingsHandler);

    return router;
};
