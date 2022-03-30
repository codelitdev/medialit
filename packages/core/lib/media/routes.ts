import express from 'express';
import fileUpload from 'express-fileupload';
import { tempFileDirForUploads } from '../config/constants';
import apikey from '../apikey/middleware';
import { getMedia, getMediaDetails, uploadMedia, deleteMedia } from './handlers';

const router = express.Router();

router.use(
    fileUpload({
      useTempFiles: true,
      tempFileDir: tempFileDirForUploads
    })
);

router.post('/', apikey, uploadMedia);
router.get('/', apikey, getMedia);
router.get('/:mediaId', apikey, getMediaDetails);
router.delete('/:mediaId', apikey, deleteMedia);

export default router;