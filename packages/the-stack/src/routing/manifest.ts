import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ComponentType, type ReactNode } from "react";
import type {
  LayoutComponent,
  RootComponent,
  RouteComponent,
  RouteDefinition,
  RouteModule,
  RuntimeMode,
} from "./types";
import { renderHtml } from "../server/render";
import { PostRoot } from "../runtime/post-root";

const ROUTES_DIR = path.join("src", "routes");
const ROOT_ENTRY = path.join("src", "root.tsx");
const ROUTE_EXTENSIONS = [".tsx", ".ts"];
const LAYOUT_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const requireForCache = createRequire(import.meta.url);

export type RouteFileChangeType = "add" | "change" | "unlink";

export interface RouteFileChange {
  filePath: string;
  event: RouteFileChangeType;
}

export interface RouteManifestOptions {
  appRoot: string;
  mode: RuntimeMode;
}

export interface RouteManifest {
  render(pathname: string): Promise<Response | null>;
  handleFileChange(change: RouteFileChange): void;
}

export function createRouteManifest(
  options: RouteManifestOptions,
): RouteManifest {
  return new FileSystemRouteManifest(options);
}

class FileSystemRouteManifest implements RouteManifest {
  private readonly appRoot: string;
  private readonly mode: RuntimeMode;
  private readonly routesDir: string;
  private readonly rootEntryPath: string;
  private cache: Map<string, RouteDefinition> | null = null;
  private rootComponent: RootComponent | null = null;
  private routeIndexByFile = new Map<string, string>();
  private pendingChanges = new Map<string, RouteFileChangeType>();
  private moduleVersions = new Map<string, number>();

  constructor(options: RouteManifestOptions) {
    this.appRoot = options.appRoot;
    this.mode = options.mode;
    this.routesDir = path.normalize(path.join(this.appRoot, ROUTES_DIR));
    this.rootEntryPath = path.normalize(path.join(this.appRoot, ROOT_ENTRY));
  }

  handleFileChange(change: RouteFileChange): void {
    const normalized = normalizeFilePath(change.filePath);
    if (
      normalized !== this.rootEntryPath &&
      !normalized.startsWith(this.routesDir)
    ) {
      return;
    }

    this.pendingChanges.set(normalized, change.event);
    this.bumpModuleVersion(normalized);

    if (normalized === this.rootEntryPath) {
      this.rootComponent = null;
    }
  }

  async render(pathname: string): Promise<Response | null> {
    const map = await this.ensureRoutes();
    const definition = map.get(normalizePath(pathname));
    if (!definition) {
      return null;
    }

    const root = await this.loadRootComponent();
    const layouts = await this.loadLayouts(definition.layouts);
    const Route = await this.loadRouteComponent(definition.filePath);
    const leaf = createElement(Route);
    const withLayouts = wrapWithLayouts(layouts, leaf);
    const tree = createElement(
      root,
      null,
      createElement(PostRoot, { mode: this.mode }, withLayouts),
    );
    return renderHtml(tree);
  }

  private async ensureRoutes(): Promise<Map<string, RouteDefinition>> {
    if (!this.cache) {
      await this.refreshAllRoutes();
    }

    if (this.pendingChanges.size > 0) {
      await this.applyPendingChanges();
    }

    if (!this.cache) {
      throw new Error("Route manifest failed to initialize");
    }

    return this.cache;
  }

  private async refreshAllRoutes(): Promise<void> {
    const map = await this.scanRoutes();
    this.cache = map;
    this.routeIndexByFile.clear();
    for (const definition of map.values()) {
      this.routeIndexByFile.set(
        normalizeFilePath(definition.filePath),
        definition.path,
      );
    }
  }

  private async scanRoutes(): Promise<Map<string, RouteDefinition>> {
    const exists = await directoryExists(this.routesDir);
    if (!exists) {
      throw new Error(`Routes directory not found at ${this.routesDir}`);
    }

    const definitions: RouteDefinition[] = [];
    await this.walkDirectory(this.routesDir, [], [], definitions);
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
    const layoutEntry = entries.find(
      (entry) => entry.isFile() && isLayoutFile(entry.name),
    );
    const layoutPaths = layoutEntry
      ? [...layouts, path.join(currentDir, layoutEntry.name)]
      : layouts;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const segmentName = sanitizeSegment(entry.name);
        const nextSegments = segmentName
          ? [...segments, segmentName]
          : [...segments];
        await this.walkDirectory(
          path.join(currentDir, entry.name),
          nextSegments,
          layoutPaths,
          output,
        );
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

  private async applyPendingChanges(): Promise<void> {
    if (!this.cache) {
      await this.refreshAllRoutes();
    }

    if (!this.cache) {
      return;
    }

    const entries = Array.from(this.pendingChanges.entries());
    this.pendingChanges.clear();

    for (const [filePath, event] of entries) {
      if (filePath === this.rootEntryPath) {
        continue;
      }

      if (!filePath.startsWith(this.routesDir)) {
        continue;
      }

      const fileName = path.basename(filePath);

      if (isLayoutFile(fileName)) {
        if (event !== "change") {
          await this.refreshDirectory(path.dirname(filePath));
        }
        continue;
      }

      if (!isRouteFile(fileName)) {
        continue;
      }

      if (event === "unlink") {
        this.removeRouteByFile(filePath);
        this.moduleVersions.delete(filePath);
        continue;
      }

      const definition = await this.buildRouteDefinition(filePath);
      if (!definition) {
        this.removeRouteByFile(filePath);
        continue;
      }

      this.upsertRouteDefinition(definition);
    }
  }

  private async buildRouteDefinition(
    filePath: string,
  ): Promise<RouteDefinition | null> {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        return null;
      }
    } catch {
      return null;
    }

    const relativeDir = path.relative(this.routesDir, path.dirname(filePath));
    if (relativeDir.startsWith("..")) {
      return null;
    }

    const segments = computeSegmentsFromRelativeDir(relativeDir);
    const fileName = path.basename(filePath);
    const routePath = computeRoutePath(segments, fileName);
    const layouts = await this.collectLayoutsForFile(filePath);

    return {
      path: routePath,
      filePath,
      layouts,
    };
  }

  private async collectLayoutsForFile(filePath: string): Promise<string[]> {
    const layouts: string[] = [];
    const relativeDir = path.relative(this.routesDir, path.dirname(filePath));
    if (relativeDir.startsWith("..")) {
      return layouts;
    }

    const segments = relativeDir.split(path.sep).filter(Boolean);
    let currentDir = this.routesDir;
    const rootLayout = await findLayoutInDirectory(currentDir);
    if (rootLayout) {
      layouts.push(rootLayout);
    }
    for (const segment of segments) {
      currentDir = path.join(currentDir, segment);
      const layoutPath = await findLayoutInDirectory(currentDir);
      if (layoutPath) {
        layouts.push(layoutPath);
      }
    }
    return layouts;
  }

  private async refreshDirectory(dirPath: string): Promise<void> {
    if (!this.cache) {
      await this.refreshAllRoutes();
      return;
    }

    const normalizedDir = normalizeFilePath(dirPath);
    this.removeRoutesInDirectory(normalizedDir);

    const exists = await directoryExists(normalizedDir);
    if (!exists) {
      return;
    }

    const ancestorLayouts = await this.collectAncestorLayouts(normalizedDir);
    const segments = this.computeSegmentsForDirectory(normalizedDir);
    const definitions: RouteDefinition[] = [];
    await this.walkDirectory(
      normalizedDir,
      segments,
      ancestorLayouts,
      definitions,
    );
    definitions.sort((a, b) => a.path.localeCompare(b.path));
    for (const definition of definitions) {
      this.upsertRouteDefinition(definition);
    }
  }

  private async collectAncestorLayouts(dirPath: string): Promise<string[]> {
    if (dirPath === this.routesDir) {
      return [];
    }

    const layouts: string[] = [];
    const rootLayout = await findLayoutInDirectory(this.routesDir);
    if (rootLayout) {
      layouts.push(rootLayout);
    }

    const relative = path.relative(this.routesDir, dirPath);
    if (!relative || relative === "." || relative.startsWith("..")) {
      return layouts;
    }

    const segments = relative.split(path.sep).filter(Boolean);
    let currentDir = this.routesDir;
    for (let i = 0; i < segments.length - 1; i += 1) {
      currentDir = path.join(currentDir, segments[i]);
      const layoutPath = await findLayoutInDirectory(currentDir);
      if (layoutPath) {
        layouts.push(layoutPath);
      }
    }
    return layouts;
  }

  private computeSegmentsForDirectory(dirPath: string): string[] {
    const relative = path.relative(this.routesDir, dirPath);
    return computeSegmentsFromRelativeDir(relative);
  }

  private removeRouteByFile(filePath: string): void {
    const normalized = normalizeFilePath(filePath);
    const routePath = this.routeIndexByFile.get(normalized);
    if (!routePath || !this.cache) {
      return;
    }

    this.cache.delete(routePath);
    this.routeIndexByFile.delete(normalized);
  }

  private removeRoutesInDirectory(dirPath: string): void {
    if (!this.cache) {
      return;
    }

    for (const [filePath, routePath] of Array.from(
      this.routeIndexByFile.entries(),
    )) {
      if (isInsideDirectory(filePath, dirPath)) {
        this.cache.delete(routePath);
        this.routeIndexByFile.delete(filePath);
      }
    }
  }

  private upsertRouteDefinition(definition: RouteDefinition): void {
    if (!this.cache) {
      this.cache = new Map();
    }

    this.cache.set(definition.path, definition);
    this.routeIndexByFile.set(
      normalizeFilePath(definition.filePath),
      definition.path,
    );
  }

  private bumpModuleVersion(filePath: string): void {
    const current = this.moduleVersions.get(filePath) ?? 0;
    this.moduleVersions.set(filePath, current + 1);
    clearRequireCache(filePath);
  }

  private async loadRootComponent(): Promise<RootComponent> {
    if (this.mode === "prod" && this.rootComponent) {
      return this.rootComponent;
    }

    const module = (
      await this.importModule<{ default: RootComponent }>(this.rootEntryPath)
    ).default;
    if (!module) {
      throw new Error(`Root component not found at ${this.rootEntryPath}`);
    }

    if (this.mode === "prod") {
      this.rootComponent = module;
    }
    return module;
  }

  private async loadLayouts(layoutPaths: string[]): Promise<LayoutComponent[]> {
    const layouts: LayoutComponent[] = [];
    for (const layoutPath of layoutPaths) {
      const module = (
        await this.importModule<{ default: LayoutComponent }>(layoutPath)
      ).default;
      if (!module) {
        throw new Error(`Layout component not found at ${layoutPath}`);
      }
      layouts.push(module);
    }
    return layouts;
  }

  private async loadRouteComponent(filePath: string): Promise<RouteComponent> {
    const module = await this.importModule<RouteModule>(filePath);
    if (!module.default) {
      throw new Error(
        `Route at ${filePath} does not export a default component.`,
      );
    }
    return module.default;
  }

  private async importModule<T>(filePath: string): Promise<T> {
    const normalized = normalizeFilePath(filePath);
    let version = this.moduleVersions.get(normalized);
    if (version === undefined) {
      version = 0;
      this.moduleVersions.set(normalized, version);
    }

    const query = this.mode === "dev" ? `?the_stack_v=${version}` : "";
    const url = pathToFileURL(filePath).href + query;
    return import(url) as Promise<T>;
  }
}

function wrapWithLayouts(
  layouts: LayoutComponent[],
  leaf: ReactNode,
): ReactNode {
  return layouts.reduceRight(
    (child, Layout) =>
      createElement(
        Layout as ComponentType<{ children: ReactNode }>,
        null,
        child,
      ),
    leaf,
  );
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
  const ext = ROUTE_EXTENSIONS.find((extension) =>
    fileName.endsWith(extension),
  );
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

async function findLayoutInDirectory(dirPath: string): Promise<string | null> {
  for (const extension of LAYOUT_EXTENSIONS) {
    const candidate = path.join(dirPath, `_layout${extension}`);
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function isInsideDirectory(filePath: string, dirPath: string): boolean {
  const relative = path.relative(dirPath, filePath);
  if (!relative || relative.startsWith("..")) {
    return false;
  }
  return !path.isAbsolute(relative);
}

function computeSegmentsFromRelativeDir(relativeDir: string): string[] {
  if (!relativeDir || relativeDir === "." || relativeDir.startsWith("..")) {
    return [];
  }

  return relativeDir
    .split(path.sep)
    .filter(Boolean)
    .reduce<string[]>((acc, segment) => {
      const sanitized = sanitizeSegment(segment);
      if (sanitized) {
        acc.push(sanitized);
      }
      return acc;
    }, []);
}

function normalizeFilePath(filePath: string): string {
  return path.normalize(filePath);
}

function clearRequireCache(filePath: string): void {
  try {
    const resolved = requireForCache.resolve(filePath);
    const cache = requireForCache.cache as Record<string, unknown> | undefined;
    if (cache && cache[resolved]) {
      delete cache[resolved];
    }
  } catch {
    // ignore resolution errors
  }
}
