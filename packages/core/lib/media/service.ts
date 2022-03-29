import thumbnail from '@medialit/thumbnail';
import { createReadStream, rmdirSync } from 'fs';
import {
  tempFileDirForUploads,
  imagePattern,
  videoPattern,
  thumbnailWidth,
  thumbnailHeight,
  imagePatternIncludingGif,
  cdnEndpoint,
} from "../config/constants";
import imageUtils from "@medialit/images";
import {
  foldersExist,
  createFolders,
  moveFile,
} from "./utils/manage-files-on-disk";
import MediaModel, { Media } from './model';
import { generateSignedUrl, putObject } from '../services/s3';
import logger from '../services/log';
import generateKey from './utils/generate-key';
import { getMediaSettings } from '../media-settings/queries';
import generateFileName from './utils/generate-file-name';
import mongoose from 'mongoose';
import GetPageProps from './GetPageProps';
import { getMedia, getPaginatedPage } from './queries';

const generateAndUploadThumbnail = async ({
  workingDirectory,
  cloudDirectory,
  mimetype,
  originalFilePath,
} : {
  workingDirectory: string,
  cloudDirectory: string,
  mimetype: string,
  originalFilePath: string
}): Promise<boolean> => {
  const thumbPath = `${workingDirectory}/thumb.webp`;

  let isThumbGenerated = false; // to indicate if the thumbnail name is to be saved to the DB
  if (imagePatternIncludingGif.test(mimetype)) {
    await thumbnail.forImage(originalFilePath, thumbPath, {
      width: thumbnailWidth,
    });
    isThumbGenerated = true;
  }
  if (videoPattern.test(mimetype)) {
    await thumbnail.forVideo(originalFilePath, thumbPath, {
      width: thumbnailWidth,
      height: thumbnailHeight,
    });
    isThumbGenerated = true;
  }

  if (isThumbGenerated) {
    await putObject({
      Key: `${cloudDirectory}/thumb.webp`,
      Body: createReadStream(thumbPath),
      ContentType: "image/webp",
      ACL: "public-read",
    });
  }

  return isThumbGenerated;
};

interface UploadProps {
  userId: string;
  file: any;
  access: string;
  caption: string;
}

async function upload ({ userId, file, access, caption }: UploadProps): Promise<{mediaId: string}> {
  const fileName = generateFileName(file.name);
  const mediaSettings = await getMediaSettings(userId);
  const useWebP = mediaSettings?.useWebP || false;
  const webpOutputQuality = mediaSettings?.webpOutputQuality || 0;
  const directory = `${userId}/${fileName.name}`;

  const temporaryFolderForWork = `${tempFileDirForUploads}/${fileName.name}`;
  if (!foldersExist([temporaryFolderForWork])) {
    createFolders([temporaryFolderForWork]);
  }

  const fileExtension =
    useWebP && imagePattern.test(file.mimetype)
      ? "webp"
      : fileName.ext;
  const mainFilePath = `${temporaryFolderForWork}/main.${fileExtension}`;
  await moveFile(file, mainFilePath);
  if (useWebP && imagePattern.test(file.mimetype)) {
    await imageUtils.convertToWebp(mainFilePath, webpOutputQuality);
  }

  await putObject({
    Key: generateKey({
      userId, 
      mediaId: fileName.name, 
      extension: fileName.ext
    }),
    Body: createReadStream(mainFilePath),
    ContentType: file.mimetype,
    ACL: access === "public" ? "public-read" : "private",
  });

  let isThumbGenerated = false;
  try {
    isThumbGenerated = await generateAndUploadThumbnail({
      workingDirectory: temporaryFolderForWork,
      cloudDirectory: directory,
      mimetype: file.mimetype,
      originalFilePath: mainFilePath,
    });
  } catch (err: any) {
    logger.error({ err }, err.message)
  }

  rmdirSync(temporaryFolderForWork, { recursive: true });

  const mediaObject: Media = {
    mediaId: fileName.name,
    userId: new mongoose.Types.ObjectId(userId),
    originalFileName: file.name,
    mimeType: file.mimetype,
    size: file.size,
    thumbnailGenerated: isThumbGenerated,
    caption,
    accessControl: access === "public" ? "public-read" : "private" 
  };

  const media = await MediaModel.create(mediaObject);

  return media.mediaId;
};

// exports.serve = async ({ media, res }) => {
//   res.status(200).json({
//     media: {
//       id: media.id,
//       file: `${cdnEndpoint}/${media.file}`,
//       thumbnail: media.thumbnail ? `${cdnEndpoint}/${media.thumbnail}` : "",
//       caption: media.caption,
//     },
//   });
// };

// export const deleteObject = async (media: any, res: any) => {
//   try {
//     await deleteObjectPromise({ Key: media.file });
//     if (media.thumbnail) {
//       await deleteObjectPromise({ Key: media.thumbnail });
//     }
//     await media.delete();

//     return res.status(200).json({ message: SUCCESS });
//   } catch (err: any) {
//     return res.status(500).json({ message: err.message });
//   }
// };

type MappedMedia = Partial<Omit<Omit<Media, 'accessControl'>, 'thumbnailGenerated'>> & { 
    access: "private" | "public",
    thumbnail: string;
};

async function getPage ({ userId, access, page, recordsPerPage }: GetPageProps): Promise<MappedMedia[]> {
  const result = await getPaginatedPage({
      userId,
      access,
      page,
      recordsPerPage
  })
  const mappedResult = result.map((media: Media): MappedMedia => ({
      mediaId: media.mediaId,
      originalFileName: media.originalFileName,
      mimeType: media.mimeType,
      size: media.size,
      access: media.accessControl === "private" ? "private" : "public",
      thumbnail: media.thumbnailGenerated 
          ? `${cdnEndpoint}/${media.userId}/${media.mediaId}/thumb.webp`
          : "",
      caption: media.caption
  }));

  return mappedResult;
}

async function getMediaDetails (userId: string, mediaId: string): Promise<Record<string, unknown> | null> {
  const media: Media | null = await getMedia(userId, mediaId);
  if (!media) {
    return null;
  }

  const extension = media.mimeType.split("/")[1];

  return { 
      mediaId: media.mediaId,
      originalFileName: media.originalFileName,
      mimeType: media.mimeType,
      size: media.size,
      access: media.accessControl === "private" ? "private" : "public",
      file: media.accessControl === "private"
          ? await generateSignedUrl({ 
              name: generateKey({
                  userId,
                  mediaId: media.mediaId,
                  extension
              }) 
          }) 
          : `${cdnEndpoint}/${media.userId}/${media.mediaId}/main.${media.mimeType.split("/")[1]}`,
      thumbnail: media.thumbnailGenerated 
          ? `${cdnEndpoint}/${media.userId}/${media.mediaId}/thumb.webp`
          : "",
      caption: media.caption
  };
}

export default {
  upload,
  getPage,
  getMediaDetails
}