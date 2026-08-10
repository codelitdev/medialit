import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const nextConfigs = nextCoreWebVitals.map((config) => ({
  ...config,
  files: ["apps/web/**/*.{js,jsx,ts,tsx}", "apps/docs/**/*.{js,jsx,ts,tsx}"],
  settings: {
    ...(config.settings ?? {}),
    react: {
      ...((config.settings ?? {}).react ?? {}),
      version: "19.2.8",
    },
    next: {
      ...((config.settings ?? {}).next ?? {}),
      rootDir: ["apps/web/", "apps/docs/"],
    },
  },
}));

export default defineConfig([
  globalIgnores([
    "**/node_modules",
    "**/dist",
    "**/components/ui/**",
    "**/.next/**",
    ".migrations/**",
    "apps/docs/.source",
    "apps/docs/out/**",
    "**/next-env.d.ts"
  ]),
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  tseslint.configs.recommended,
  ...nextConfigs,
  {
    files: ["**/__tests__/**/*.{js,jsx,ts,tsx}", "**/*.{spec,test}.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.jest,
        describe: "readonly",
        test: "readonly",
        expect: "readonly",
        it: "readonly",
        jest: "readonly"
      }
    }
  },
  {
    settings: {
      react: {
        version: "19.2.8"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-duplicate-enum-values": "off",
      "react/react-in-jsx-scope": ["off", {
        patterns: [{
          group: ["apps/web/**"],
          message: "Next.js based project",
        }]
      }]
    },
  },
]);
