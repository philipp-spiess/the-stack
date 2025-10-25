import { promises as fs } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createRouteManifest } from "../routing/manifest";
import { createLogger } from "../utils/logger";

const OUTPUT_DIR = ".the-stack";

export async function runBuild(): Promise<void> {
  const logger = createLogger();
  const appRoot = process.cwd();
  const outDir = path.join(appRoot, OUTPUT_DIR);

  logger.info("Building production server bundle…");
  const start = performance.now();

  await fs.mkdir(outDir, { recursive: true });

  // Force route discovery to surface potential errors during build time.
  const manifest = createRouteManifest({
    appRoot,
    mode: "prod",
  });
  await manifest.render("/__manifest_check__"); // triggers scanning; response is ignored

  const entrySource = createServerEntrySource();
  const entryPath = path.join(outDir, "server-entry.ts");
  await fs.writeFile(entryPath, entrySource, "utf8");

  const result = await Bun.build({
    entrypoints: [entryPath],
    outdir: outDir,
    target: "bun",
    format: "esm",
    splitting: false,
    minify: false,
  });

  if (!result.success) {
    const message = result.logs.map((log) => log.message).join("\n");
    throw new Error(`Build failed:\n${message}`);
  }

  const builtPath = path.join(outDir, "server-entry.js");
  const finalPath = path.join(outDir, "server.js");
  await fs.rename(builtPath, finalPath);

  const elapsed = Math.round(performance.now() - start);
  logger.info(`Built ${path.relative(appRoot, finalPath)} in ${elapsed}ms`);
}

function createServerEntrySource(): string {
  return `import { startStandaloneServer } from "the-stack/server/standalone";

export async function start() {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST;

  return startStandaloneServer({
    appRoot: process.cwd(),
    port,
    host,
  });
}

if (import.meta.main) {
  await start();
}
`;
}
