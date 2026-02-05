import { config as loadDotFile } from "dotenv";
loadDotFile();

import express from "express";
import connectToDatabase from "./config/db";
import passport from "passport";
import mediaRoutes from "./media/routes";
import signatureRoutes from "./signature/routes";
import mediaSettingsRoutes from "./media-settings/routes";
import tusRoutes from "./tus/routes";
import logger from "./services/log";
import { createUser, findByEmail } from "./user/queries";
import { Apikey, User } from "@medialit/models";
import { createApiKey } from "./apikey/queries";
import swaggerUi from "swagger-ui-express";
import swaggerOutput from "./swagger_output.json";

import { spawn } from "child_process";
import { cleanupTUSUploads } from "./tus/cleanup";
import { cleanupExpiredTempUploads } from "./media/cleanup";
import { HOUR_IN_SECONDS } from "./config/constants";

connectToDatabase();
const app = express();

app.set("trust proxy", process.env.ENABLE_TRUST_PROXY === "true");

app.use(express.json());

app.get(
    "/health",
    /* 
        #swagger.summary = 'Status of the server', 
        #swagger.description = 'Returns the status of the server and uptime'
        #swagger.responses[200] = {
            description: "OK",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            status: {
                                type: "string",
                                example: "ok",
                            },
                            uptime: {
                                type: "number",
                                example: 12.345,
                            },
                        },
                    },
                },
            },
        }
    */
    (req, res) => {
        res.status(200).json({
            status: "ok",
            uptime: process.uptime(),
        });
    },
);

app.get(
    "/openapi.json",
    /* #swagger.ignore = true */
    (req, res) => {
        res.json(swaggerOutput);
    },
);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerOutput));

app.use("/settings/media", mediaSettingsRoutes(passport));
app.use("/media/signature", signatureRoutes);
app.use("/media", tusRoutes);
app.use("/media", mediaRoutes);

app.get(
    "/cleanup/temp",
    /* 
        #swagger.tags = ['Cleanup']
        #swagger.summary = 'Cleanup expired temp uploads'
        #swagger.description = 'Cleanup expired temp uploads'
        #swagger.responses[200] = {
            description: "OK",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: {
                                type: "string",
                                example: "Expired temp uploads cleaned up",
                            },
                        },
                    },
                },
            },
        }
    */
    async (req, res) => {
        await cleanupExpiredTempUploads();
        res.status(200).json({
            message: "Expired temp uploads cleaned up",
        });
    },
);
app.get(
    "/cleanup/tus",
    /* 
        #swagger.tags = ['Cleanup']
        #swagger.summary = 'Cleanup expired tus uploads'
        #swagger.description = 'Cleanup expired tus uploads'
        #swagger.responses[200] = {
            description: "OK",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: {
                                type: "string",
                                example: "Expired tus uploads cleaned up",
                            },
                        },
                    },
                },
            },
        }
    */
    async (req, res) => {
        await cleanupTUSUploads();
        res.status(200).json({
            message: "Expired tus uploads cleaned up",
        });
    },
);

const port = process.env.PORT || 80;

if (process.env.EMAIL) {
    createAdminUser();
}

checkConfig()
    .then(checkDependencies)
    .then(() => {
        app.listen(port, () => {
            logger.info(`Medialit server running at ${port}`);
        });

        // Setup background cleanup job for expired tus uploads
        setInterval(
            async () => {
                await cleanupTUSUploads();
            },
            HOUR_IN_SECONDS, // 1 hour
        );

        // Setup background cleanup job for expired temp uploads
        setInterval(
            async () => {
                await cleanupExpiredTempUploads();
            },
            HOUR_IN_SECONDS, // 1 hour
        );
    });

async function checkConfig() {
    if (!process.env.DB_CONNECTION_STRING) {
        throw new Error("DB_CONNECTION_STRING is not set");
    }
    if (!process.env.CLOUD_KEY || !process.env.CLOUD_SECRET) {
        throw new Error(
            "Cloud credentials (CLOUD_KEY and CLOUD_SECRET) are not set",
        );
    }
    if (
        !process.env.CLOUD_BUCKET_NAME ||
        !process.env.CLOUD_PUBLIC_BUCKET_NAME
    ) {
        throw new Error(
            "Cloud bucket name (CLOUD_BUCKET_NAME and CLOUD_PUBLIC_BUCKET_NAME) are not set",
        );
    }
    if (
        !process.env.CDN_ENDPOINT &&
        (!process.env.CLOUD_ENDPOINT || !process.env.CLOUD_ENDPOINT_PUBLIC)
    ) {
        throw new Error(
            "If CDN_ENDPOINT is not set, both CLOUD_ENDPOINT and CLOUD_ENDPOINT_PUBLIC must be provided",
        );
    }
}

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
            const user = await createUser(email, undefined, "subscribed");
            const apikey: Apikey = await createApiKey(user.id, "App 1");
            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            console.log(`@     API key: ${apikey.key}      @`);
            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        }
    } catch (error) {
        logger.error({ error }, "Failed to create admin user");
    }
}
