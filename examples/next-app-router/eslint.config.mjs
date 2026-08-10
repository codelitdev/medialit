import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals.map((config) => ({
    ...config,
    files: ["app/**/*.{js,jsx,ts,tsx}", "components/**/*.{js,jsx,ts,tsx}"],
  })),
  {
    settings: {
      react: {
        version: "19.2.0",
      },
    },
  },
]);
