import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Stamp the build time so the home screen can show when it was last deployed.
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
