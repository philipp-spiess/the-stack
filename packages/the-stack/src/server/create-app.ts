import { Hono } from "hono";
import type { RouteManifest } from "../routing/manifest";

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
    const response = await options.manifest.render(context.req.path);
    if (!response) {
      return context.notFound();
    }
    return response;
  });

  return app;
}
