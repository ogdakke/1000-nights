import { bindings, defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "thousand-nights",
    compatibilityDate: "2026-09-28",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "worker/index.ts",
    observability: {
      enabled: true,
      headSamplingRate: 1,
    },
    assets: {
      runWorkerFirst: ["/api/*"],
    },
    env: {
      GITHUB_CLIENT_ID: bindings.text("Ov23litjbxLTnIbHy7r7"),
      GITHUB_CLIENT_SECRET: bindings.secret(),
      DB: bindings.d1({
        name: "thousand-nights",
        id: "0af53f06-75b8-40e5-9b9b-a516bdf574d0",
      }),
      ASSETS: bindings.assets(),
    },
  },
});
