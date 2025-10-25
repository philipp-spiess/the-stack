# the-stack Architecture Notes

## Overview
- `packages/the-stack` is a Bun-first meta framework that exposes the `the-stack` CLI (`dev`, `build`, `start`), orchestrating Vite (for DX) plus a Hono HTTP server (for SSR).
- Applications (e.g. `packages/demo`) structure code under `src/root.tsx` and `src/routes/**`, exporting default React components (they can be `async`) that power GET responses. Rendering is 100 % server-side; no client bundle is generated today.

Multiple agents share this directory structure, so keep commits atomic whenever you are told to commit and only touch the files strictly required for your setup.

## Validation Checklist
- Run `bun test` from the repo root whenever you modify routing, rendering, or CLI code to ensure the manifest logic keeps passing.
- Run `bun run check` after TypeScript-affecting changes; it fans out to each workspace’s `check` script (running `tsgo` in `packages/the-stack` and `packages/demo`) and then enforces formatting via `bunx oxfmt --check .`.
- Use `bun run format` to apply `oxfmt` fixes across the repo whenever the formatter reports drift.

## CLI Lifecycle
| Command | Responsibilities |
| --- | --- |
| `dev` | Starts Vite in middleware mode with `appType: "custom"` so Vite only handles static assets / HMR plumbing. Creates a Hono app that streams React responses via `renderToPipeableStream`. Bridges Node `http` ↔ `fetch` using helpers in `src/server/node-http.ts`. |
| `build` | Scans routes in production mode to surface errors, generates `.the-stack/server-entry.ts`, and uses `Bun.build` to emit `.the-stack/server.js`. |
| `start` | Dynamically imports `.the-stack/server.js` and runs the exported `start()` helper, which boots the standalone Hono server. |

## Routing Model
1. `createRouteManifest` recursively scans `src/routes/**`.
2. Route files export default React components (async-friendly) that serve GET requests; layout folders supply `_layout.tsx` components (also allowed to be async) that wrap their descendants.
3. Group folders like `(marketing)` are skipped in the URL path but still contribute layouts.
4. On each request, the manifest dynamically imports the root, applicable layouts, and route module, then nests them as React elements and streams the response.

## Rendering & Server
- Server responses are streamed via `renderToPipeableStream`, prefixed with a single `<!DOCTYPE html>`.
- Incoming Node requests are normalized into the Web `Request` shape; responses are pumped back to Node’s `ServerResponse`.
- Hono runs inside both dev (as Vite middleware) and prod (standalone Bun server) environments to keep routing identical across modes.

## Vite Integration
- Vite runs with `middlewareMode: true` and `appType: "custom"` so it never serves HTML; it only provides asset resolution/HMR and exposes the dev websocket.
- `setupRouteWatcher` (dev-only) registers `src/routes/**/*.{ts,tsx}` + `src/root.tsx` with Vite’s watcher. Any add/change/unlink triggers a debounced `server.ws.send({ type: "full-reload" })`, ensuring browsers reload when server templates mutate even though they sit outside the client graph.

## Production Story
1. `the-stack build` → `.the-stack/server.js`.
2. `the-stack start` → runs the Bun-built bundle, which in turn spins up Hono + route manifest in `prod` mode (using cached modules and no Vite involvement).
3. There is still zero client bundle; future work can mount a client environment once we explicitly opt-in.

## Demo App (`packages/demo`)
- Demonstrates route grouping (`(marketing)`), shared layout, and a standalone `/shop` route.
- `root.tsx` defines the html/head/body skeleton and nav, acting as the top-level wrapper for every route response.
