import { Hono } from "hono";
import type {
  RouteManifest,
  RouteManifestRenderOptions,
} from "../routing/manifest";

interface CreateAppOptions {
  manifest: RouteManifest;
}

export interface StackApp {
  fetch(
    request: Request,
    env?: unknown,
    executionContext?: unknown,
  ): Promise<Response> | Response;
}

export function createApp(options: CreateAppOptions): StackApp {
  const app = new Hono();

  app.get("*", async (context) => {
    const stackOnly = context.req.query("_stack") === "1";
    const currentRoutePath = context.req.query("_stack_current");
    const renderOptions: RouteManifestRenderOptions | undefined = stackOnly
      ? { stackOnly, currentRoutePath }
      : undefined;
    const response = await options.manifest.render(
      context.req.path,
      renderOptions,
    );
    if (!response) {
      return context.notFound();
    }
    return response;
  });

  return app;
}
