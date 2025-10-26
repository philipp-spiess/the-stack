import { describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRouteManifest } from "./manifest";
import type { RouteDefinition, RuntimeMode } from "./types";

const demoAppRoot = path.resolve(import.meta.dir, "../../..", "demo");

function setupManifest(mode: RuntimeMode = "prod") {
  return createRouteManifest({
    appRoot: demoAppRoot,
    mode,
  });
}

describe("FileSystemRouteManifest", () => {
  it("scans routes with layout inheritance and group folder omission", async () => {
    const manifest = setupManifest();
    const routeMap: Map<string, RouteDefinition> = await (
      manifest as any
    ).ensureRoutes();

    const about = routeMap.get("/about");
    if (!about) {
      throw new Error("About route missing from manifest");
    }
    expect(about.filePath.replaceAll("\\", "/")).toContain(
      "routes/(marketing)/about.tsx",
    );
    expect(about.layouts).toHaveLength(1);
    expect(about.layouts[0].filePath.replaceAll("\\", "/")).toContain(
      "routes/(marketing)/_layout.tsx",
    );

    const home = routeMap.get("/");
    if (!home) {
      throw new Error("Home route missing from manifest");
    }
    expect(home.filePath.replaceAll("\\", "/")).toContain(
      "routes/(marketing)/index.tsx",
    );
    expect(home.layouts).toHaveLength(1);
  });

  it("renders marketing routes through the shared root layout", async () => {
    const manifest = setupManifest();
    const response = await manifest.render("/about");
    expect(response).not.toBeNull();

    const html = await response!.text();
    expect(html).toContain("The Stack Demo");
    expect(html).toContain("Welcome to the marketing pages.");
    expect(html).toContain("<h2>About</h2>");
  });

  it("wraps rendered output with stack boundary markers", async () => {
    const manifest = setupManifest();
    const response = await manifest.render("/about");
    expect(response).not.toBeNull();

    const html = await response!.text();
    expect(html).toContain('data-stack-id="layout:/:(marketing)/_layout.tsx"');
    expect(html).toContain(
      'data-stack-id="layout:/:(marketing)/_layout.tsx"><section>',
    );
    expect(html).toContain('data-stack-id="route:/about"');
    expect(html).not.toContain('data-stack-id="__root"');
  });

  it("normalizes trailing slashes and query strings when resolving paths", async () => {
    const manifest = setupManifest();
    const response = await manifest.render("/about/?ref=promo");
    expect(response).not.toBeNull();

    const html = await response!.text();
    expect(html).toContain("<h2>About</h2>");
  });

  it("returns null when no matching route exists", async () => {
    const manifest = setupManifest();
    const response = await manifest.render("/not-found");
    expect(response).toBeNull();
  });

  it("reloads a route component when the file changes", async () => {
    const sandbox = await createSandboxApp();
    const manifest = createRouteManifest({
      appRoot: sandbox.appRoot,
      mode: "dev",
    });

    try {
      const initial = await manifest.render("/");
      expect(await initial!.text()).toContain("Initial");

      await fs.writeFile(sandbox.routeFile, routeSource("Updated"), "utf8");
      manifest.handleFileChange({
        filePath: sandbox.routeFile,
        event: "change",
      });

      const updated = await manifest.render("/");
      expect(await updated!.text()).toContain("Updated");
    } finally {
      await sandbox.cleanup();
    }
  });

  it("discovers new routes when files are added", async () => {
    const sandbox = await createSandboxApp();
    const manifest = createRouteManifest({
      appRoot: sandbox.appRoot,
      mode: "dev",
    });
    const aboutFile = path.join(sandbox.routesDir, "about.tsx");

    try {
      await manifest.render("/");
      await fs.writeFile(aboutFile, routeSource("About"), "utf8");
      manifest.handleFileChange({ filePath: aboutFile, event: "add" });

      const response = await manifest.render("/about");
      expect(response).not.toBeNull();
      expect(await response!.text()).toContain("About");
    } finally {
      await sandbox.cleanup();
    }
  });
});

async function createSandboxApp() {
  const dir = await fs.mkdtemp(path.join(process.cwd(), "the-stack-manifest-"));
  const srcDir = path.join(dir, "src");
  const routesDir = path.join(srcDir, "routes");
  await fs.mkdir(routesDir, { recursive: true });
  const rootFile = path.join(srcDir, "root.tsx");
  await fs.writeFile(rootFile, rootSource, "utf8");

  const routeFile = path.join(routesDir, "index.tsx");
  await fs.writeFile(routeFile, routeSource("Initial"), "utf8");

  return {
    appRoot: dir,
    routeFile,
    routesDir,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}

const rootSource = `export default function Root({ children }) {
  return children;
}
`;

function routeSource(label: string) {
  return `export default function Route() {
  return "${label}";
}
`;
}
