import express, { Request, Response } from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import {
    tempFileDirForUploads,
    maxFileUploadSizeSubscribed,
} from "../config/constants";
import apikey from "../apikey/middleware";
import {
    getMedia,
    getMediaDetails,
    uploadMedia,
    deleteMedia,
    sealMedia,
    getMediaCount,
    getTotalSpaceOccupied,
} from "./handlers";
import signatureMiddleware from "../signature/middleware";
import storage from "./storage-middleware";
import { getSignatureFromReq } from "../signature/utils";

const router = express.Router();

router.post(
    "/create",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Upload Media'
        #swagger.description = 'Upload a new media file. Requires an API key in the `x-medialit-apikey` header or a signature in the `x-medialit-signature` header.'
        #swagger.security = [{ "apiKeyAuth": [] }]
        #swagger.parameters['x-medialit-signature'] = {
            in: 'header',
            description: 'Upload Signature for secure client-side uploads',
            schema: { type: 'string' },
            required: false
        }
        #swagger.requestBody = {
            content: {
                "multipart/form-data": {
                    schema: {
                        type: "object",
                        properties: {
                            file: { type: "string", format: "binary" },
                            caption: { type: "string" },
                            access: { type: "string", enum: ["public", "private"] },
                            group: { type: "string" }
                        }
                    }
                }
            }
        }
        #swagger.responses[200] = {
            description: 'The created Media object',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/Media' }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
    */
    cors(),
    fileUpload({
        useTempFiles: true,
        tempFileDir: tempFileDirForUploads,
        limits: {
            fileSize: maxFileUploadSizeSubscribed,
            files: 1,
        },
    }),
    (req: Request, res: Response, next: (...args: any[]) => void) => {
        const signature = getSignatureFromReq(req);
        if (signature) {
            signatureMiddleware(
                req as Request & { user: any; apikey: string },
                res,
                next,
            );
        } else {
            apikey(req, res, next);
        }
    },
    storage,
    uploadMedia,
);

router.options("/create", /* #swagger.ignore = true */ cors());

router.post(
    "/get/count",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Get Media Count'
        #swagger.description = 'Get the total number of media files.'
        #swagger.security = [{ "apiKeyAuth": [] }] 
        #swagger.responses[200] = {
            description: 'Count retrieved successfully',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/MediaCountResponse' }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
    */
    apikey,
    getMediaCount,
);
router.post(
    "/get/size",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Get Total Size'
        #swagger.description = 'Get the total size of all media files in bytes.'
        #swagger.security = [{ "apiKeyAuth": [] }] 
        #swagger.responses[200] = {
            description: 'Size retrieved successfully',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/MediaSizeResponse' }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
    */
    apikey,
    getTotalSpaceOccupied,
);
router.post(
    "/get/:mediaId",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Get Media Details'
        #swagger.description = 'Retrieve metadata for a specific media item.'
        #swagger.security = [{ "apiKeyAuth": [] }] 
        #swagger.parameters['mediaId'] = {
            in: 'path',
            description: 'ID of the media file',
            required: true,
            schema: { type: 'string' }
        }
        #swagger.responses[200] = {
            description: 'Media details retrieved successfully',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/Media' }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[404] = { description: 'Media not found' }
    */
    apikey,
    getMediaDetails,
);
router.post(
    "/get",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'List Media'
        #swagger.description = 'List all media files. POST is used to support authenticated requests and complex filters.'
        #swagger.security = [{ "apiKeyAuth": [] }]
        #swagger.parameters['query'] = {
            in: 'query',
            name: 'filters',
            schema: { $ref: '#/components/schemas/GetMediaQuery' }
        }
        #swagger.responses[200] = {
            description: 'List retrieved successfully',
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: { $ref: '#/components/schemas/Media' }
                    }
                }
            }
        } 
        #swagger.responses[401] = { description: 'Unauthorized' }
    */
    apikey,
    getMedia,
);
router.post(
    "/seal/:mediaId",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Seal Media'
        #swagger.description = 'Seal a media file (mark as processed/finalized).'
        #swagger.security = [{ "apiKeyAuth": [] }]
        #swagger.parameters['mediaId'] = {
            in: 'path',
            description: 'ID of the media file',
            required: true,
            schema: { type: 'string' }
        }
        #swagger.responses[200] = {
            description: 'The created Media object',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/Media' }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
    */
    apikey,
    sealMedia,
);
router.delete(
    "/delete/:mediaId",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Delete Media'
        #swagger.description = 'Permanently delete a media file.'
        #swagger.security = [{ "apiKeyAuth": [] }] 
        #swagger.parameters['mediaId'] = {
            in: 'path',
            description: 'ID of the media file',
            required: true,
            schema: { type: 'string' }
        }
        #swagger.responses[200] = {
            description: 'Media deleted successfully',
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
        #swagger.responses[404] = { description: 'Media not found' }
    */
    apikey,
    deleteMedia,
);

export default router;
