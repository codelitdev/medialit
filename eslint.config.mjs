import path from "node:path";
import { createRequire } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
// import pluginReact from "eslint-plugin-react";
import { FlatCompat } from "@eslint/eslintrc";

const require = createRequire(import.meta.url);
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  resolvePluginsRelativeTo: path.dirname(require.resolve("eslint-config-next")),
});

// `eslint-config-next` parses JavaScript with `next/babel`. That preset resolves
// from the Next app, not the repo root, so `bun run lint` fails on every JS file.
// Keep the Next rules and let ESLint use its normal parser.
function withoutNextBabelParser(config) {
  if (!config.languageOptions) return config;
  const languageOptions = { ...config.languageOptions };
  delete languageOptions.parser;
  if (languageOptions.parserOptions) {
    const parserOptions = { ...languageOptions.parserOptions };
    delete parserOptions.babelOptions;
    delete parserOptions.requireConfigFile;
    delete parserOptions.allowImportExportEverywhere;
    languageOptions.parserOptions = parserOptions;
  }
  return { ...config, languageOptions };
}

const nextConfigs = compat
  .config({
    extends: ["next"],
    settings: {
      next: {
        rootDir: "apps/web/",
      },
    },
  })
  .map(withoutNextBabelParser);


export default defineConfig([
  globalIgnores([
    "**/node_modules",
    "**/dist",
    "**/components/ui/**",
    "**/.next/**",
    ".migrations/**",
    "apps/docs/.source",
    "apps/docs/out/**",
    "**/next-env.d.ts",
    "**/*.generated.ts"
  ]),
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  tseslint.configs.recommended,
  // pluginReact.configs.flat.recommended,
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