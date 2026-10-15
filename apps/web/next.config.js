/** @type {import('next').NextConfig} */
const allowedDevOrigins = process.env.WEB_ORIGIN
    ? [new URL(process.env.WEB_ORIGIN).hostname, "*.taile2f1.ts.net"]
    : ["*.taile2f1.ts.net"];

const nextConfig = {
    output: "standalone",
    allowedDevOrigins,
    transpilePackages: [
        "@medialit/models",
        "@codelitdev/observability",
        "@codelitdev/design-system",
    ],
    images: {
        // Thumbnails come from whatever storage the deployment uses, so the
        // browser loads them directly instead of through Next's optimizer.
        unoptimized: true,
    },
};

module.exports = nextConfig;
