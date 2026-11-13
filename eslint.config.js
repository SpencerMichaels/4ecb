import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "reverse-engineering/generated/**",
      "reverse-engineering/tools/dotnet/**",
      "CharacterBuilder/**",
      "CBLoader/**",
      "tmp/**",
      // The shared 4e-kit submodule keeps its own style; lint it there.
      "vendor/**",
      ".claude/worktrees/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
