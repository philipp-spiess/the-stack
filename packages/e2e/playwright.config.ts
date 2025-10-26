import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const DEV_PORT = 4173;
const PROD_PORT = 4174;
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 2_000,
  },
  reporter: [["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "dev",
      use: {
        baseURL: `http://127.0.0.1:${DEV_PORT}`,
      },
    },
    {
      name: "prod",
      use: {
        baseURL: `http://127.0.0.1:${PROD_PORT}`,
      },
    },
  ],
  webServer: [
    {
      command: `bash -lc "cd '${REPO_ROOT}' && bun run --filter demo dev -- --host 127.0.0.1 --port ${DEV_PORT} --vite-port 5174"`,
      url: `http://127.0.0.1:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      command: `bash -lc "cd '${REPO_ROOT}' && bun run --filter demo build && HOST=127.0.0.1 PORT=${PROD_PORT} bun run --filter demo start"`,
      url: `http://127.0.0.1:${PROD_PORT}`,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
  ],
});
