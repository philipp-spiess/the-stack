import http from "node:http";
import { AddressInfo } from "node:net";
import { performance } from "node:perf_hooks";
import { createApp } from "./create-app";
import { createRequestFromNode, sendResponseToNode } from "./node-http";
import { createRouteManifest } from "../routing/manifest";
import { createLogger } from "../utils/logger";

export interface StandaloneServerOptions {
  appRoot: string;
  port: number;
  host?: string;
}

export async function startStandaloneServer(
  options: StandaloneServerOptions,
): Promise<http.Server> {
  const logger = createLogger();
  const start = performance.now();

  const manifest = createRouteManifest({
    appRoot: options.appRoot,
    mode: "prod",
  });
  const app = createApp({ manifest });

  const server = http.createServer(async (req, res) => {
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

  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host, resolve);
  });

  const address = server.address() as AddressInfo;
  const elapsed = Math.round(performance.now() - start);
  logger.info(
    `Production server listening: http://${address.address === "::" ? "localhost" : address.address}:${address.port} (ready in ${elapsed}ms)`,
  );

  return server;
}
