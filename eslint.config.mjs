import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Next 16 removed `next lint`; this is the flat-config form of the old .eslintrc.json
// (next/core-web-vitals + next/typescript), run by `npm run lint` over the folders `next lint`
// covered (NC-166). The React Compiler rules that came with eslint-plugin-react-hooks 7 are on;
// the few places that set state from an effect on purpose say why on the line.
export default defineConfig([...nextVitals, ...nextTs, globalIgnores([".next/**", "next-env.d.ts"])]);
