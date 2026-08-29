import js from "@eslint/js";
import { browserGlobals } from "./eslint.globals.js";

export default [
  js.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "supabase/functions/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    files: ["contract.js"],
    languageOptions: { sourceType: "script", globals: browserGlobals },
    rules: {
      "no-unused-vars": "off",
      "no-redeclare": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        ...browserGlobals,
        process: "readonly",
        Buffer: "readonly",
        AbortSignal: "readonly",
        performance: "readonly",
      },
    },
  },
  {
    files: ["scripts/migrate-*.mjs"],
    rules: { "no-unused-vars": "off" },
  },
];
