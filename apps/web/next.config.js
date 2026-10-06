/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    transpilePackages: ["@medialit/models", "@codelitdev/observability"],
    images: {
        // Thumbnails come from whatever storage the deployment uses, so the
        // browser loads them directly instead of through Next's optimizer.
        unoptimized: true,
    },
};

module.exports = nextConfig;
