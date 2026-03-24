import { vibeCheck } from "@ianbicking/personal-vibe-check/eslint";
export default [
  ...vibeCheck({ react: true }),
  {
    files: ["test/**/*.ts"],
    rules: {
      "single-export/single-export": "off",
      "required-exports/required-exports": "off",
      "class-export/class-export": "off",
      "error/no-literal-error-message": "off",
      "error/no-generic-error": "off",
      "error/require-custom-error": "off",
      "no-restricted-syntax": "off",
      "import/order": "off",
    },
  },
];
