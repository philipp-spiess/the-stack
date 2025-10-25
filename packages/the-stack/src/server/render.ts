import { PassThrough, Readable } from "node:stream";
import type { ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server.node";

export async function renderHtml(element: ReactNode): Promise<Response> {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();

    let didError = false;

    const { pipe, abort } = renderToPipeableStream(element, {
      onShellReady() {
        pipe(stream);
        const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
        resolve(
          new Response(body, {
            status: didError ? 500 : 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
            },
          }),
        );
      },
      onShellError(error) {
        reject(error);
      },
      onError(error) {
        didError = true;
        console.error(error);
      },
    });

    const timeout = setTimeout(() => {
      abort();
      reject(new Error("React rendering timed out."));
    }, 10000);

    stream.on("close", () => {
      clearTimeout(timeout);
    });
  });
}
