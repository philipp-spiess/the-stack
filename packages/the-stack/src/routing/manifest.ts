import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ComponentType, type ReactNode } from "react";
import type { RuntimeMode, RouteDefinition, RouteModule } from "./types";
import type { LayoutComponent, RootComponent } from "./types";
import { renderHtml } from "../server/render";

const ROUTES_DIR = path.join("src", "routes");
const ROOT_ENTRY = path.join("src", "root.tsx");
const ROUTE_EXTENSIONS = [".tsx", ".ts"];

export interface RouteManifestOptions {
  appRoot: string;
  mode: RuntimeMode;
}

export interface RouteManifest {
  render(pathname: string): Promise<Response | null>;
}

export function createRouteManifest(options: RouteManifestOptions): RouteManifest {
  return new FileSystemRouteManifest(options);
}

class FileSystemRouteManifest implements RouteManifest {
  private readonly appRoot: string;
  private readonly mode: RuntimeMode;
  private cache: Map<string, RouteDefinition> | null = null;
  private rootComponent: RootComponent | null = null;

  constructor(options: RouteManifestOptions) {
    this.appRoot = options.appRoot;
    this.mode = options.mode;
  }

  async render(pathname: string): Promise<Response | null> {
    const map = await this.ensureRoutes();
    const definition = map.get(normalizePath(pathname));
    if (!definition) {
      return null;
    }

    const root = await this.loadRootComponent();
    const layouts = await this.loadLayouts(definition.layouts);
    const route = await this.loadRoute(definition.filePath);

    if (typeof route.get !== "function") {
      throw new Error(`Route at ${definition.filePath} does not export a "get" function.`);
    }

    const leaf = await route.get();
    const withLayouts = wrapWithLayouts(layouts, leaf);
    const tree = createElement(root, null, withLayouts);
    return renderHtml(tree);
  }

  private async ensureRoutes(): Promise<Map<string, RouteDefinition>> {
    if (this.mode === "dev" || !this.cache) {
      this.cache = await this.scanRoutes();
    }
    return this.cache;
  }

  private async scanRoutes(): Promise<Map<string, RouteDefinition>> {
    const routesDir = path.join(this.appRoot, ROUTES_DIR);
    const exists = await directoryExists(routesDir);
    if (!exists) {
      throw new Error(`Routes directory not found at ${routesDir}`);
    }

    const definitions: RouteDefinition[] = [];
    await this.walkDirectory(routesDir, [], [], definitions);
    definitions.sort((a, b) => a.path.localeCompare(b.path));

    const map = new Map<string, RouteDefinition>();
    for (const route of definitions) {
      map.set(route.path, route);
    }
    return map;
  }

  private async walkDirectory(
    currentDir: string,
    segments: string[],
    layouts: string[],
    output: RouteDefinition[],
  ): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const layoutEntry = entries.find((entry) => entry.isFile() && isLayoutFile(entry.name));
    const layoutPaths = layoutEntry ? [...layouts, path.join(currentDir, layoutEntry.name)] : layouts;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const segmentName = sanitizeSegment(entry.name);
        const nextSegments = segmentName ? [...segments, segmentName] : [...segments];
        await this.walkDirectory(path.join(currentDir, entry.name), nextSegments, layoutPaths, output);
      } else if (entry.isFile() && isRouteFile(entry.name)) {
        if (isLayoutFile(entry.name)) {
          continue;
        }

        const routePath = computeRoutePath(segments, entry.name);
        output.push({
          path: routePath,
          filePath: path.join(currentDir, entry.name),
          layouts: layoutPaths,
        });
      }
    }
  }

  private async loadRootComponent(): Promise<RootComponent> {
    if (this.mode === "prod" && this.rootComponent) {
      return this.rootComponent;
    }

    const rootPath = path.join(this.appRoot, ROOT_ENTRY);
    const module = (await dynamicImport<{ default: RootComponent }>(rootPath, this.mode)).default;
    if (!module) {
      throw new Error(`Root component not found at ${rootPath}`);
    }

    if (this.mode === "prod") {
      this.rootComponent = module;
    }
    return module;
  }

  private async loadLayouts(layoutPaths: string[]): Promise<LayoutComponent[]> {
    const layouts: LayoutComponent[] = [];
    for (const layoutPath of layoutPaths) {
      const module = (await dynamicImport<{ default: LayoutComponent }>(layoutPath, this.mode)).default;
      if (!module) {
        throw new Error(`Layout component not found at ${layoutPath}`);
      }
      layouts.push(module);
    }
    return layouts;
  }

  private async loadRoute(filePath: string): Promise<RouteModule> {
    return dynamicImport<RouteModule>(filePath, this.mode);
  }
}

function wrapWithLayouts(layouts: ComponentType<{ children: ReactNode }>[], leaf: ReactNode): ReactNode {
  return layouts.reduceRight((child, Layout) => createElement(Layout, null, child), leaf);
}

function normalizePath(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  const withoutQuery = pathname.split("?")[0];
  if (withoutQuery === "/") {
    return "/";
  }

  const trimmed = withoutQuery.replace(/\/+$/, "");
  if (!trimmed) {
    return "/";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function computeRoutePath(parentSegments: string[], fileName: string): string {
  const baseName = stripExtension(fileName);
  const segments = [...parentSegments];

  if (baseName !== "index") {
    segments.push(baseName);
  }

  return `/${segments.join("/")}`.replace(/\/+/g, "/");
}

function stripExtension(fileName: string): string {
  const ext = ROUTE_EXTENSIONS.find((extension) => fileName.endsWith(extension));
  return ext ? fileName.slice(0, -ext.length) : fileName;
}

function sanitizeSegment(segment: string): string {
  if (/^\(.*\)$/.test(segment)) {
    return "";
  }
  return segment;
}

function isRouteFile(fileName: string): boolean {
  return ROUTE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function isLayoutFile(fileName: string): boolean {
  return /^_layout\.(t|j)sx?$/.test(fileName);
}

async function dynamicImport<T>(filePath: string, mode: RuntimeMode): Promise<T> {
  const url = pathToFileURL(filePath).href + (mode === "dev" ? `?t=${Date.now()}` : "");
  return import(url) as Promise<T>;
}
