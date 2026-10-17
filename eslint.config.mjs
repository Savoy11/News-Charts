import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Next 16 removed `next lint`; this is the flat-config form of the old .eslintrc.json
// (next/core-web-vitals + next/typescript), run by `npm run lint` over the folders `next lint`
// covered (NC-166).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // New in eslint-plugin-react-hooks 7 (React Compiler guidance), absent from the config this
    // replaces. They flag 18 existing, deliberate patterns — chiefly reading localStorage in an
    // effect after mount so server and client render alike. Off to keep this upgrade a like-for-
    // like lint; adopting them is its own checklist item.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
    },
  },
  globalIgnores([".next/**", "next-env.d.ts"]),
]);
