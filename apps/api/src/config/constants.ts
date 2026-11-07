// App config
export const appName = process.env.APP_NAME || "MediaLit";
export const tempFileDirForUploads = process.env.TEMP_FILE_DIR_FOR_UPLOADS;
export const maxFileUploadSizeSubscribed = process.env
    .MAX_UPLOAD_SIZE_SUBSCRIBED
    ? +process.env.MAX_UPLOAD_SIZE_SUBSCRIBED
    : 2147483648; // 2GB
export const maxFileUploadSizeNotSubscribed = process.env
    .MAX_UPLOAD_SIZE_NOT_SUBSCRIBED
    ? +process.env.MAX_UPLOAD_SIZE_NOT_SUBSCRIBED
    : 52428800; // 50MB
export const maxStorageAllowedSubscribed = process.env
    .MAX_STORAGE_ALLOWED_SUBSCRIBED
    ? +process.env.MAX_STORAGE_ALLOWED_SUBSCRIBED
    : 107374182400; // 100GB
export const maxStorageAllowedNotSubscribed = process.env
    .MAX_STORAGE_ALLOWED_NOT_SUBSCRIBED
    ? +process.env.MAX_STORAGE_ALLOWED_NOT_SUBSCRIBED
    : 1073741824; // 1GB
export const SIGNATURE_VALIDITY_MINUTES = +(
    process.env.SIGNATURE_VALIDITY_MINUTES || "1440"
); // 1 day
export const SIGNATURE_LENGTH = 100;
export const MEDIA_ID_LENGTH = 40;
export const imagePattern = /^image\/(jpe?g|png)$/;
export const imagePatternForThumbnailGeneration = /^image\/(jpe?g|png|webp)$/;
export const videoPattern = /video/;
export const thumbnailWidth = 120;
export const thumbnailHeight = 69;
export const numberOfRecordsPerPage = 10;

// Mail config
export const mailHost = process.env.EMAIL_HOST;
export const mailUser = process.env.EMAIL_USER;
export const mailPass = process.env.EMAIL_PASS;
export const mailFrom = process.env.EMAIL_FROM;
export const mailPort = parseInt(process.env.EMAIL_PORT || "") || 587;

// AWS S3 config
export const CLOUD_ENDPOINT = process.env.CLOUD_ENDPOINT || "";
export const CLOUD_ENDPOINT_PUBLIC = process.env.CLOUD_ENDPOINT_PUBLIC || "";
export const cloudRegion = process.env.CLOUD_REGION || "";
export const cloudKey = process.env.CLOUD_KEY || "";
export const cloudSecret = process.env.CLOUD_SECRET || "";
export const cloudBucket = process.env.CLOUD_BUCKET_NAME || "";
export const cloudPublicBucket = process.env.CLOUD_PUBLIC_BUCKET_NAME || "";
export const PATH_PREFIX = process.env.PATH_PREFIX || "";
export const HOUR_IN_SECONDS = 1000 * 60 * 60;

// Cloudfront config
export const ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT =
    process.env.ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT === "true";
export const CLOUDFRONT_KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID || "";
export const CLOUDFRONT_PRIVATE_KEY = process.env.CLOUDFRONT_PRIVATE_KEY || "";
export const CDN_MAX_AGE = process.env.CDN_MAX_AGE
    ? +process.env.CDN_MAX_AGE
    : HOUR_IN_SECONDS; // one hour

// CDN config
export const CDN_ENDPOINT = process.env.CDN_ENDPOINT || "";

export const TEMP_MEDIA_EXPIRATION_HOURS = process.env
    .TEMP_MEDIA_EXPIRATION_HOURS
    ? +process.env.TEMP_MEDIA_EXPIRATION_HOURS
    : 24; // 24 hours
export const DISABLE_TAGGING = process.env.DISABLE_TAGGING === "true";

const MIB = 1024 * 1024;
/** Size of each part streamed to S3. S3 needs at least 5 MiB for every part
 * but the last, and R2 needs all of them to be the same size. */
export const UPLOAD_PART_SIZE_BYTES = Math.max(
    5 * MIB,
    +(process.env.UPLOAD_PART_SIZE_BYTES || 8 * MIB),
);
/** Parts of one upload that may be in flight to S3 at the same time. Each
 * holds up to `UPLOAD_PART_SIZE_BYTES` in memory (form-data) or on disk
 * (tus). */
export const UPLOAD_PART_CONCURRENCY = Math.max(
    1,
    +(process.env.UPLOAD_PART_CONCURRENCY || 2),
);
/** Form-data uploads one API process streams at a time. Each holds parts in
 * memory, so past this the API answers 503 instead of running out. */
export const MAX_CONCURRENT_FORM_UPLOADS = Math.max(
    1,
    +(process.env.MAX_CONCURRENT_FORM_UPLOADS || 16),
);
/** How long a connection may sit with no data before it's closed. Requests
 * have no overall time limit, so a big upload on a slow link can finish. */
export const REQUEST_IDLE_TIMEOUT_MS = Math.max(
    1000,
    +(process.env.REQUEST_IDLE_TIMEOUT_MS || 2 * 60 * 1000),
);
