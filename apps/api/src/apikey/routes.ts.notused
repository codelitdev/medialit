import express from "express";
import subscription from "../subscription/middleware";
import { createApikey, deleteApikey, getApikey } from "./handlers";

export default (passport: any) => {
    const router = express.Router();

    router.post(
        "/create",
        passport.authenticate("jwt", { session: false }),
        subscription,
        createApikey,
    );
    router.post(
        "/get",
        passport.authenticate("jwt", { session: false }),
        subscription,
        getApikey,
    );
    router.post(
        "/get/:keyId",
        passport.authenticate("jwt", { session: false }),
        subscription,
        getApikey,
    );
    router.delete(
        "/delete/:keyId",
        passport.authenticate("jwt", { session: false }),
        subscription,
        deleteApikey,
    );

    return router;
};
