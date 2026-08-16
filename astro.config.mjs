import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://littlesun.space",
  integrations: [react()],
  vite: {
    build: {
      chunkSizeWarningLimit: 750,
    },
  },
});
