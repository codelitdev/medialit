import { config as loadDotFile } from "dotenv";
loadDotFile();

import express from "express";
import connectToDatabase from "./config/db";
import passport from "passport";
import userRoutes from "./user/routes";
import jwt from "./user/passport-strategies/jwt";
import apikeyRoutes from "./apikey/routes";
import mediaRoutes from "./media/routes";
import presignedUrlRoutes from "./presigning/routes";
import mediaSettingsRoutes from "./media-settings/routes";
import logger from "./services/log";

connectToDatabase();
const app = express();

app.set("trust proxy", process.env.ENABLE_TRUST_PROXY === "true");

passport.use(jwt);
// passport.use(apikey);
app.use(passport.initialize());
app.use(express.json());

app.use("/user", userRoutes(passport));
app.use("/settings/media", mediaSettingsRoutes(passport));
app.use("/settings/apikey", apikeyRoutes(passport));
app.use("/media/presigned", presignedUrlRoutes);
app.use("/media", mediaRoutes);

const port = process.env.PORT || 80;

// TODO: Put checks for mandatory env vars

app.listen(port, () => {
    logger.info(`Medialit server running at ${port}`);
});
