import express from "express";
import jwt from "jsonwebtoken";
import { jwtExpire, jwtSecret } from "../config/constants";
import { SUCCESS } from "../config/strings";
import magicLink from "./passport-strategies/magic-link";

export default (passport: any) => {
    passport.use(magicLink);
    const router = express.Router();

    router.post(
        "/login",
        passport.authenticate("magiclink", { action: "requestToken" }),
        (req, res) => {
            res.status(200).json({ message: SUCCESS });
        }
    );

    router.get(
        "/login",
        passport.authenticate("magiclink", {
            action: "acceptToken",
            session: false,
        }),
        (req: any, res: any) => {
            const token = jwt.sign({ email: req.user.email }, jwtSecret, {
                expiresIn: jwtExpire,
            });

            return res.status(200).json({ access_token: token });
        }
    );

    return router;
};
