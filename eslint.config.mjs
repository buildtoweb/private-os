import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
    // Preserve the project's existing TypeScript baseline during the framework
    // upgrade. These rules were not enforced by the former `next lint` setup;
    // new code should still prefer concrete types and derived state.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",
      "import/no-anonymous-default-export": "warn",
    },
  },
];

export default eslintConfig;
