// App config
export const appName = process.env.APP_NAME || "MediaLit";
export const jwtSecret = process.env.JWT_SECRET || "r@nd0m1e";
export const jwtExpire = process.env.JWT_EXPIRES_IN || "1d";
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
export const APIKEY_RESTRICTION_REFERRER = "referrer";
export const APIKEY_RESTRICTION_IP = "ipaddress";
export const APIKEY_RESTRICTION_CUSTOM = "custom";
export const imagePattern = /^image\/(jpe?g|png)$/;
export const imagePatternForThumbnailGeneration = /^image\/(jpe?g|png|webp)$/;
export const videoPattern = /video/;
export const thumbnailWidth = 120;
export const thumbnailHeight = 69;
export const numberOfRecordsPerPage = 10;

// Database config
export const dbConnectionString = process.env.DB_CONNECTION_STRING;

// Mail config
export const mailHost = process.env.EMAIL_HOST;
export const mailUser = process.env.EMAIL_USER;
export const mailPass = process.env.EMAIL_PASS;
export const mailFrom = process.env.EMAIL_FROM;
export const mailPort = parseInt(process.env.EMAIL_PORT || "") || 587;

// AWS S3 config
export const CLOUD_ENDPOINT = process.env.CLOUD_ENDPOINT || "";
export const cloudRegion = process.env.CLOUD_REGION || "";
export const cloudKey = process.env.CLOUD_KEY || "";
export const cloudSecret = process.env.CLOUD_SECRET || "";
export const cloudBucket = process.env.CLOUD_BUCKET_NAME || "";
export const PATH_PREFIX = process.env.PATH_PREFIX || "";
export const HOUR_IN_SECONDS = 1000 * 60 * 60;

// Cloudfront config
export const USE_CLOUDFRONT = process.env.USE_CLOUDFRONT === "true";
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
