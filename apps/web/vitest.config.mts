import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests that touch components need the app's "@/..." path alias.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
