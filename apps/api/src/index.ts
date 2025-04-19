import { config as loadDotFile } from "dotenv";
loadDotFile();

import express from "express";
import connectToDatabase from "./config/db";
import passport from "passport";
import mediaRoutes from "./media/routes";
import presignedUrlRoutes from "./presigning/routes";
import mediaSettingsRoutes from "./media-settings/routes";
import logger from "./services/log";
import { createUser, findByEmail } from "./user/queries";
import { Apikey, Constants, User } from "@medialit/models";
import { createApiKey } from "./apikey/queries";
import { spawn } from "child_process";

connectToDatabase();
const app = express();

app.set("trust proxy", process.env.ENABLE_TRUST_PROXY === "true");

app.use(express.json());

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        uptime: process.uptime(),
    });
});

app.use("/settings/media", mediaSettingsRoutes(passport));
app.use("/media/presigned", presignedUrlRoutes);
app.use("/media", mediaRoutes);

const port = process.env.PORT || 80;

if (process.env.EMAIL) {
    createAdminUser();
}

checkDependencies().then(() => {
    app.listen(port, () => {
        logger.info(`Medialit server running at ${port}`);
    });
});

async function checkDependencies() {
    try {
        // Check ffmpeg
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn("ffmpeg", ["-version"]);
            ffmpeg.on("error", () =>
                reject(new Error("ffmpeg is not installed")),
            );
            ffmpeg.on("exit", (code) => {
                if (code === 0) resolve(true);
                else reject(new Error("ffmpeg is not installed"));
            });
        });

        // Check webp
        await new Promise((resolve, reject) => {
            const webp = spawn("cwebp", ["-version"]);
            webp.on("error", () => reject(new Error("webp is not installed")));
            webp.on("exit", (code) => {
                if (code === 0) resolve(true);
                else reject(new Error("webp is not installed"));
            });
        });
    } catch (error: any) {
        logger.error({ error: error.message });
        process.exit(1);
    }
}

async function createAdminUser() {
    try {
        const email = process.env.EMAIL!.toLowerCase();
        const user: User | null = await findByEmail(email);

        if (!user) {
            const user = await createUser(
                email,
                undefined,
                new Date(
                    new Date().setFullYear(new Date().getFullYear() + 100),
                ),
                "subscribed",
            );
            const apikey: Apikey = await createApiKey(user.id, "App 1");
            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            console.log(`@     API key: ${apikey.key}      @`);
            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            await createApiKey(user.id, Constants.internalApikeyName, true);
        }
    } catch (error) {
        logger.error({ error }, "Failed to create admin user");
    }
}
