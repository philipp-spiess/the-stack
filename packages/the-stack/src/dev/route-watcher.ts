import path from "node:path";
import type { ViteDevServer } from "vite";
import type { RouteManifest } from "../routing/manifest";
import type { Logger } from "../utils/logger";

interface RouteWatcherOptions {
  vite: ViteDevServer;
  appRoot: string;
  logger: Logger;
  manifest: RouteManifest;
}

const ROUTES_DIR = path.join("src", "routes");
const ROOT_ENTRY = path.join("src", "root.tsx");

export function setupRouteWatcher(options: RouteWatcherOptions): void {
  const routeDir = path.join(options.appRoot, ROUTES_DIR);
  const rootEntry = path.join(options.appRoot, ROOT_ENTRY);
  const glob = path.join(routeDir, "**/*.{ts,tsx}");

  // Ensure chokidar tracks the server routes and root template.
  options.vite.watcher.add([glob, rootEntry]);

  const debouncedReload = debounce((reason: string) => {
    options.logger.info(`Routes changed (${reason}). Triggering browser reload.`);
    options.vite.ws.send({ type: "full-reload" });
  }, 80);

  const handledEvents: Array<"add" | "change" | "unlink"> = ["add", "change", "unlink"];
  handledEvents.forEach((event) => {
    options.vite.watcher.on(event, (filePath) => {
      if (!isRelevantFile(filePath, routeDir, rootEntry)) {
        return;
      }
      options.manifest.handleFileChange({ filePath, event });
      debouncedReload(`${event}: ${path.relative(options.appRoot, filePath)}`);
    });
  });
}

function isRelevantFile(filePath: string, routeDir: string, rootEntry: string): boolean {
  const normalized = path.normalize(filePath);
  return normalized.startsWith(path.normalize(routeDir)) || normalized === path.normalize(rootEntry);
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: NodeJS.Timeout | undefined;

  return (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delay);
  };
}
