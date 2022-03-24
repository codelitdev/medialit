import express from 'express';
import fileUpload from 'express-fileupload';
import { tempFileDirForUploads } from '../../config/constants';
import { getMedia, uploadMedia } from './handlers';

export default (passport: any) => {
    const router = express.Router();

    router.use(
        fileUpload({
          useTempFiles: true,
          tempFileDir: tempFileDirForUploads
        })
    );

    router.post('/a', passport.authenticate('custom', { session: false }), uploadMedia);
    router.get('/', passport.authenticate('custom', { session: false }), getMedia);

    return router;
};