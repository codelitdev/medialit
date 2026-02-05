import express from "express";
import apikey from "../apikey/middleware";
import { getSignature } from "./handlers";

const router = express.Router();
router.post(
    "/create",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Create Upload Signature'
        #swagger.description = 'Generate a signature for secure client-side uploads.'
        #swagger.security = [{ "apiKeyAuth": [] }] 
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
        #swagger.responses[401] = { description: 'Unauthorized' }
    */
    apikey,
    getSignature,
);

export default router;
