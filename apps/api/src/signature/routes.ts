import express from "express";
import apikey from "../apikey/middleware";
import { getSignature } from "./handlers";
import { authenticatedApiLimiter } from "../auth/limiters";

const router = express.Router();
router.post(
    "/create",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Create Upload Signature'
        #swagger.description = 'Generate a signature for secure client-side uploads.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.responses[200] = {
            description: 'Signature generated successfully',
            content: {
                "application/json": {
                    schema: {
                        $ref: "#/components/schemas/SignatureResponse"
                    }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    getSignature,
);

export default router;
