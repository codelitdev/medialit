import { createMDX } from 'fumadocs-mdx/next';
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const withMDX = createMDX();

/** @type {import('next').NextConfig | ((phase: string) => import('next').NextConfig)} */
const config = (phase) => ({
  reactStrictMode: true,
  ...(phase === PHASE_DEVELOPMENT_SERVER ? {} : { output: "export" }),
  images: {
    unoptimized: true,
  },
});

export default withMDX(config);
