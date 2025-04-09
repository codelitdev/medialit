import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
// import pluginReact from "eslint-plugin-react";
import { FlatCompat } from '@eslint/eslintrc'
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})


export default defineConfig([
  globalIgnores([
    "**/node_modules",
    "**/dist",
    "**/components/ui/**",
    "apps/web/.next/**",
    ".migrations/**",
  ]),
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  tseslint.configs.recommended,
  // pluginReact.configs.flat.recommended,
  ...compat.config({
    extends: ['next'],
    settings: {
      next: {
        rootDir: 'apps/web/',
      },
    },
  }),
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
        version: "18.2.0"
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