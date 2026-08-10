import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";

// Resolve ESM paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Compatibility layer for extending old configs
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import("eslint").Linter.FlatConfig[]} */
const eslintConfig = [
  // Next.js recommended configs
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),

  // Custom TypeScript & JS rule overrides
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2020,
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: prettier,
    },
    rules: {
      // ===== TYPE RULES =====

      "@typescript-eslint/explicit-function-return-type": "off", // No need to define function return types
      "@typescript-eslint/explicit-module-boundary-types": "off", // No need to define export function types
      "@typescript-eslint/explicit-member-accessibility": "off", // Don't enforce public/private
      "@typescript-eslint/no-explicit-any": "off", // Allow use of 'any'
      "@typescript-eslint/no-inferrable-types": "off", // Allow type annotations even when inferred
      "@typescript-eslint/no-unnecessary-type-constraint": "off", // Allow redundant generic constraints
      "@typescript-eslint/typedef": "off", // Disable mandatory typing
      "@typescript-eslint/ban-types": "off", // Allow built-in/primitive types like {}
      "@typescript-eslint/no-unsafe-assignment": "off", // Allow unsafe assignments
      "@typescript-eslint/no-unsafe-call": "off", // Allow unsafe function calls
      "@typescript-eslint/no-unsafe-member-access": "off", // Allow accessing members on 'any'
      "@typescript-eslint/no-unsafe-return": "off", // Allow returning 'any'
      "@typescript-eslint/no-type-alias": "off", // Allow custom types
      "@typescript-eslint/no-unnecessary-type-assertion": "off", // Allow unnecessary type assertions
      "@typescript-eslint/prefer-function-type": "off", // Allow interfaces/functions freely
      "@typescript-eslint/no-unused-vars": "off", // Disable unused variables rule
      "@typescript-eslint/no-unused-expressions": "off", // Disable for expressions like `condition && doSomething()`

      // ===== VARIABLE RULES =====

      "no-var": "off", // Allow use of 'var'
      "prefer-const": "off", // Allow 'let' even if value is never reassigned
      "no-unused-vars": "off", // Disable base ESLint unused vars too

      // ===== REACT/NEXT/JSX RULES =====

      "react/no-unescaped-entities": "off", // Disable warning for unescaped quotes in JSX
      "react/jsx-no-duplicate-props": "off", // Allow duplicate props in JSX
      "@next/next/no-html-link-for-pages": "off", // Allow using <a> instead of next/link
      "react-hooks/exhaustive-deps": "off", // Allow skipping useEffect dependencies

      "@next/next/no-html-link-for-pages": "off", // ✅ Allow <a href="/"> for navigation (use with caution)

      // ===== PRETTIER RULES =====
      "prettier/prettier": "error", // Show prettier errors as ESLint errors
    },
  },

  // Fix: Exclude .d.ts files from strict type-aware rules
  {
    files: ["**/*.d.ts"],
    languageOptions: {
      parserOptions: {
        project: null, // Ignore type project rules for .d.ts
      },
    },
  },
];

export default eslintConfig;
