import http from "node:http";
import path from "node:path";
import { AddressInfo } from "node:net";
import { performance } from "node:perf_hooks";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import { createApp } from "../server/create-app";
import { createRequestFromNode, sendResponseToNode } from "../server/node-http";
import { createRouteManifest } from "../routing/manifest";
import { setupRouteWatcher } from "../dev/route-watcher";
import { createLogger } from "../utils/logger";

const DEFAULT_PORT = 3000;

export async function runDev(argv: string[]): Promise<void> {
  const logger = createLogger();
  const options = parseDevArgs(argv);
  const appRoot = process.cwd();

  logger.info("Starting the-stack dev server…");
  const start = performance.now();

  const vite = await createViteDevServer(appRoot, options);
  const manifest = createRouteManifest({
    appRoot,
    mode: "dev",
  });
  const app = createApp({
    manifest,
  });

  setupRouteWatcher({ vite, appRoot, logger });

  const server = http.createServer((req, res) => {
    vite.middlewares(req, res, async (middlewareError) => {
      if (middlewareError) {
        logger.error(middlewareError);
        res.statusCode = 500;
        res.end("Internal Server Error");
        return;
      }

      if (res.writableEnded) {
        return;
      }

      try {
        const request = createRequestFromNode(req);
        const response = await app.fetch(request);
        await sendResponseToNode(res, response);
      } catch (error) {
        logger.error(error);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });
  });

  server.listen(options.port, options.host, () => {
    const address = server.address() as AddressInfo;
    const elapsed = Math.round(performance.now() - start);
    logger.info(
      `Ready in ${elapsed}ms: http://${address.address === "::" ? "localhost" : address.address}:${address.port}`,
    );
  });

  const close = async () => {
    logger.info("Shutting down dev server…");
    await vite.close();
    server.close();
  };

  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

async function createViteDevServer(appRoot: string, options: DevOptions): Promise<ViteDevServer> {
  const vite = await createViteServer({
    root: appRoot,
    appType: "custom",
    server: {
      middlewareMode: true,
      hmr: true,
      host: options.host,
      port: options.vitePort,
    },
    publicDir: path.join(appRoot, "public"),
  });

  // Vite's default appType is "spa"; enforcing "custom" prevents Vite from attempting to serve HTML,
  // leaving responsibility to our SSR pipeline entirely.
  vite.config.appType = "custom";
  return vite;
}

type DevOptions = {
  host: string | undefined;
  port: number;
  vitePort?: number;
};

function parseDevArgs(argv: string[]): DevOptions {
  let port = DEFAULT_PORT;
  let host: string | undefined;
  let vitePort: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--port" || value === "-p") {
      port = Number.parseInt(argv[++i] ?? "", 10) || port;
    } else if (value === "--host") {
      host = argv[++i];
    } else if (value === "--vite-port") {
      vitePort = Number.parseInt(argv[++i] ?? "", 10) || undefined;
    }
  }

  if (Number.isNaN(port)) {
    port = DEFAULT_PORT;
  }

  return { port, host, vitePort };
}
