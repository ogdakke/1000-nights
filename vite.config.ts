import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [cloudflare()],
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            main: resolve(import.meta.dirname, "index.html"),
            app: resolve(import.meta.dirname, "app/index.html"),
          },
        },
      },
    },
  },
});
