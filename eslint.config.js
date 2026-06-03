import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const noNativeDialogs = [
  {
    // Native confirm/prompt take a string. Our useConfirmAction hook takes an object,
    // so we only flag calls whose first argument is a string literal or template.
    selector:
      'CallExpression[callee.type="Identifier"][callee.name="confirm"][arguments.0.type=/Literal|TemplateLiteral/]',
    message:
      "Use o hook useConfirmAction() de @/hooks/useConfirmAction em vez de confirm nativo.",
  },
  {
    selector: 'CallExpression[callee.type="Identifier"][callee.name="prompt"]',
    message:
      "Use o hook useConfirmAction() de @/hooks/useConfirmAction em vez de prompt nativo.",
  },
  {
    selector: 'CallExpression[callee.type="Identifier"][callee.name="alert"]',
    message:
      "Use o hook useConfirmAction() ou notify.* (de @/lib/notify) em vez de alert nativo.",
  },
  {
    selector:
      'CallExpression[callee.object.name="window"][callee.property.name="confirm"]',
    message:
      "Use o hook useConfirmAction() de @/hooks/useConfirmAction em vez de window.confirm.",
  },
  {
    selector:
      'CallExpression[callee.object.name="window"][callee.property.name="prompt"]',
    message:
      "Use o hook useConfirmAction() de @/hooks/useConfirmAction em vez de window.prompt.",
  },
  {
    selector:
      'CallExpression[callee.object.name="window"][callee.property.name="alert"]',
    message:
      "Use notify.* (de @/lib/notify) em vez de window.alert.",
  },
];

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-syntax": ["error", ...noNativeDialogs],
    },
  },
);
