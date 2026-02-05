import swaggerAutogen from "swagger-autogen";
import joiToSwagger from "joi-to-swagger";
import path from "path";
import fs from "fs";

import {
    uploadMediaSchema,
    getMediaSchema,
    mediaResponseSchema,
    mediaCountResponseSchema,
    mediaSizeResponseSchema,
} from "./media/schemas";
import {
    mediaSettingsSchema,
    mediaSettingsResponseSchema,
} from "./media-settings/schemas";
import { signatureResponseSchema } from "./signature/schemas";

const doc = {
    openapi: "3.0.0",
    info: {
        title: "Medialit API",
        description: "Easy file uploads for serverless apps",
        version: "0.3.0",
    },
    servers: [
        {
            url: "{protocol}://{host}",
            description: "API Server",
            variables: {
                protocol: {
                    default: "https",
                    enum: ["https", "http"],
                },
                host: {
                    default: "api.medialit.cloud",
                },
            },
        },
    ],
    components: {
        securitySchemes: {
            apiKeyAuth: {
                type: "apiKey",
                in: "header",
                name: "x-medialit-apikey",
            },
        },
        schemas: {}, // Leave empty for autogen, verify later
    },
};

const outputFile = path.join(__dirname, "swagger_output.json");
const routes = [path.join(__dirname, "index.ts")];

swaggerAutogen()(outputFile, routes, doc).then(() => {
    // Post-process to inject Joi schemas directly (avoiding autogen inference)
    const content = JSON.parse(fs.readFileSync(outputFile, "utf8"));

    // Inject components.schemas manually
    content.components.schemas = {
        ...content.components.schemas,
        Media: joiToSwagger(mediaResponseSchema).swagger,
        MediaSettings: joiToSwagger(mediaSettingsResponseSchema).swagger,
        MediaSettingsPayload: joiToSwagger(mediaSettingsSchema).swagger,
        UploadMediaPayload: joiToSwagger(uploadMediaSchema).swagger,
        GetMediaQuery: joiToSwagger(getMediaSchema).swagger,
        SignatureResponse: joiToSwagger(signatureResponseSchema).swagger,
        MediaCountResponse: joiToSwagger(mediaCountResponseSchema).swagger,
        MediaSizeResponse: joiToSwagger(mediaSizeResponseSchema).swagger,
    };

    if (content.openapi && content.swagger) {
        delete content.swagger;
    }

    fs.writeFileSync(outputFile, JSON.stringify(content, null, 2));
});
