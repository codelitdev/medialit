import swaggerAutogen from "swagger-autogen";
import joiToSwagger from "joi-to-swagger";
import path from "path";
import fs from "fs";

import {
    uploadMediaSchema,
    getMediaSchema,
    mediaResponseSchema,
    mediaListItemResponseSchema,
    mediaCountResponseSchema,
    mediaSizeResponseSchema,
} from "./media/schemas";
import {
    mediaSettingsSchema,
    mediaSettingsResponseSchema,
} from "./media-settings/schemas";
import { signatureResponseSchema } from "./signature/schemas";

const doc = {
    openapi: "3.0.3",
    info: {
        title: "Medialit API",
        description: "Easy file uploads for serverless apps",
        version: "0.3.0",
        termsOfService: "https://medialit.cloud/p/terms",
        contact: {
            name: "Medialit Support",
            url: "https://medialit.cloud",
        },
        license: {
            name: "AGPL-3.0",
            url: "https://www.gnu.org/licenses/agpl-3.0.en.html",
        },
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
    tags: [
        {
            name: "Media",
            description: "Upload, list, and manage media resources.",
        },
        {
            name: "Settings",
            description: "Manage media processing configuration.",
        },
    ],
    components: {
        securitySchemes: {
            apiKeyAuth: {
                type: "apiKey",
                in: "header",
                name: "x-medialit-apikey",
            },
            signatureAuth: {
                type: "apiKey",
                in: "header",
                name: "x-medialit-signature",
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

    const operationIdByMethodAndPath: Record<string, string> = {
        "get /health": "getHealth",
        "post /settings/media/create": "updateMediaSettings",
        "post /settings/media/get": "getMediaSettings",
        "post /media/signature/create": "createUploadSignature",
        "post /media/create": "uploadMedia",
        "post /media/get/count": "getMediaCount",
        "post /media/get/size": "getMediaSize",
        "post /media/get/{mediaId}": "getMediaDetails",
        "post /media/get": "listMedia",
        "post /media/seal/{mediaId}": "sealMedia",
        "delete /media/delete/{mediaId}": "deleteMedia",
    };

    const errorDescriptionByStatus: Record<string, string> = {
        "400": "Bad Request",
        "401": "Unauthorized",
        "404": "Not Found",
        "409": "Conflict",
        "500": "Internal Server Error",
    };

    // Inject components.schemas manually
    content.components.schemas = {
        ...content.components.schemas,
        Media: joiToSwagger(mediaResponseSchema).swagger,
        MediaListItem: joiToSwagger(mediaListItemResponseSchema).swagger,
        MediaSettings: joiToSwagger(mediaSettingsResponseSchema).swagger,
        MediaSettingsPayload: joiToSwagger(mediaSettingsSchema).swagger,
        UploadMediaPayload: joiToSwagger(uploadMediaSchema).swagger,
        GetMediaQuery: joiToSwagger(getMediaSchema).swagger,
        SignatureResponse: joiToSwagger(signatureResponseSchema).swagger,
        MediaCountResponse: joiToSwagger(mediaCountResponseSchema).swagger,
        MediaSizeResponse: joiToSwagger(mediaSizeResponseSchema).swagger,
        ErrorResponse: {
            type: "object",
            properties: {
                error: {
                    type: "string",
                    example: "Unauthorized",
                },
            },
            required: ["error"],
            additionalProperties: false,
        },
    };

    if (content.paths) {
        delete content.paths["/cleanup/temp"];
        delete content.paths["/cleanup/tus"];
    }

    Object.entries(content.paths || {}).forEach(([apiPath, pathItem]: any) => {
        Object.entries(pathItem || {}).forEach(([method, operation]: any) => {
            if (!operation || typeof operation !== "object") {
                return;
            }

            const operationId =
                operationIdByMethodAndPath[`${method} ${apiPath}`];
            if (operationId) {
                operation.operationId = operationId;
            }

            if (Array.isArray(operation.parameters)) {
                operation.parameters.forEach((parameter: any) => {
                    if (parameter && typeof parameter === "object") {
                        delete parameter.type;
                    }
                });
            }

            if (apiPath === "/health" && method === "get") {
                operation.security = [];
            }

            if (apiPath === "/media/get" && method === "post") {
                delete operation.parameters;
                operation.requestBody = {
                    required: false,
                    content: {
                        "application/json": {
                            schema: {
                                $ref: "#/components/schemas/GetMediaQuery",
                            },
                        },
                    },
                };
                operation.responses = operation.responses || {};
                operation.responses["200"] = {
                    description: "List retrieved successfully",
                    content: {
                        "application/json": {
                            schema: {
                                type: "array",
                                items: {
                                    $ref: "#/components/schemas/MediaListItem",
                                },
                            },
                        },
                    },
                };
            }

            operation.responses = operation.responses || {};
            ["400", "401", "404", "409", "500"].forEach((statusCode) => {
                const existingResponse = operation.responses[statusCode];
                if (!existingResponse || existingResponse.$ref) {
                    return;
                }

                operation.responses[statusCode] = {
                    ...existingResponse,
                    description:
                        existingResponse.description ||
                        errorDescriptionByStatus[statusCode],
                    content: existingResponse.content || {
                        "application/json": {
                            schema: {
                                $ref: "#/components/schemas/ErrorResponse",
                            },
                            example: {
                                error: errorDescriptionByStatus[statusCode],
                            },
                        },
                    },
                };
            });
        });
    });

    if (content.openapi && content.swagger) {
        delete content.swagger;
    }

    fs.writeFileSync(outputFile, JSON.stringify(content, null, 2));
});
