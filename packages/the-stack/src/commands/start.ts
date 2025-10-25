import path from "node:path";
import { pathToFileURL } from "node:url";
import { createLogger } from "../utils/logger";

export async function runStart(): Promise<void> {
  const logger = createLogger();
  const appRoot = process.cwd();
  const builtPath = path.join(appRoot, ".the-stack", "server.js");

  try {
    const module = await import(pathToFileURL(builtPath).href);
    const start = module.start as (() => Promise<unknown>) | undefined;
    if (typeof start !== "function") {
      throw new Error(
        `Built server at ${builtPath} does not export a "start" function.`,
      );
    }

    await start();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : error);
    logger.error(
      'Run "the-stack build" before starting the production server.',
    );
    process.exitCode = 1;
  }
}
