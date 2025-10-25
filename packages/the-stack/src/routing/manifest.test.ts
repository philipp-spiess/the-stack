import { describe, expect, it } from "bun:test";
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
    const routeMap: Map<string, RouteDefinition> = await (manifest as any).ensureRoutes();

    const about = routeMap.get("/about");
    expect(about).toBeDefined();
    expect(about.filePath.replaceAll("\\", "/")).toContain("routes/(marketing)/about.tsx");
    expect(about.layouts).toHaveLength(1);
    expect(about.layouts[0].replaceAll("\\", "/")).toContain("routes/(marketing)/_layout.tsx");

    const home = routeMap.get("/");
    expect(home).toBeDefined();
    expect(home.filePath.replaceAll("\\", "/")).toContain("routes/(marketing)/index.tsx");
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
});
