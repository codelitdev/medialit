import express from 'express';
import subscription from '../../middlewares/subscription';
import { createApikey, deleteApikey, getApikey } from './handlers';

export default (passport: any) => {
    const router = express.Router();

    router.post(
        "/apikey",
        passport.authenticate("jwt", { session: false }),
        subscription,
        createApikey
    );
    router.get(
        "/apikey",
        passport.authenticate("jwt", { session: false }),
        subscription,
        getApikey
    );
    router.get(
        "/apikey/:keyId",
        passport.authenticate("jwt", { session: false }),
        subscription,
        getApikey
    );
    router.delete(
        "/apikey/:keyId",
        passport.authenticate("jwt", { session: false }),
        subscription,
        deleteApikey
    );

    return router;
}