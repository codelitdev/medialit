import express from "express";
import {
    getMediaSettingsHandler,
    updateMediaSettingsHandler,
} from "./handlers";
import apikey from "../apikey/middleware";

export default (passport: any) => {
    const router = express.Router();

    router.post(
        "/create",
        /* 
            #swagger.tags = ['Settings']
            #swagger.summary = 'Update Media Settings'
            #swagger.description = 'Update configuration for media processing.'
            #swagger.security = [{ "apiKeyAuth": [] }]
            #swagger.requestBody = {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/MediaSettingsPayload" }
                    }
                }
            }
            #swagger.responses[200] = {
                description: 'Settings updated successfully',
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: { type: "string", example: "success" }
                            }
                        }
                    }
                }
            }
            #swagger.responses[401] = { description: 'Unauthorized' }
        */
        apikey,
        updateMediaSettingsHandler,
    );

    router.post(
        "/get",
        /*
            #swagger.tags = ['Settings']
            #swagger.summary = 'Get Media Settings'
            #swagger.description = 'Retrieve current media processing configuration.'
            #swagger.security = [{ "apiKeyAuth": [] }]
            #swagger.responses[200] = {
                description: 'Settings retrieved successfully',
                content: {
                    "application/json": {
                        schema: { $ref: '#/components/schemas/MediaSettings' }
                    }
                }
            }
            #swagger.responses[401] = { description: 'Unauthorized' }
        */
        apikey,
        getMediaSettingsHandler,
    );

    return router;
};
