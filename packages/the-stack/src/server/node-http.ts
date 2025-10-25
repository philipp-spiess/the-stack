import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export function createRequestFromNode(req: IncomingMessage): Request {
  const origin = `http://${req.headers.host ?? "localhost"}`;
  const url = new URL(req.url ?? "/", origin);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const body =
    req.method && ["GET", "HEAD"].includes(req.method.toUpperCase())
      ? undefined
      : (Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>);

  const init: RequestInit = {
    method: req.method,
    headers,
    body,
  };

  if (body) {
    (init as RequestInit & { duplex: "half" }).duplex = "half";
  }

  return new Request(url, init);
}

export async function sendResponseToNode(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  const write = async () => {
    const chunk = await reader.read();
    if (chunk.done) {
      res.end();
      return;
    }

    res.write(Buffer.from(chunk.value));
    await write();
  };

  try {
    await write();
  } catch (error) {
    res.destroy(error as Error);
  }
}
