/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "courselit-qa.s3.ap-southeast-1.amazonaws.com",
            },
            {
                protocol: "https",
                hostname: "medialit-prod.s3.ap-southeast-1.amazonaws.com",
            },
        ],
    },
};

module.exports = nextConfig;
