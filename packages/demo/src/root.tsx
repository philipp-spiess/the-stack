import type { ReactNode } from "react";

export default function App({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>The Stack Demo</title>
      </head>
      <body>
        <header>
          <h1>The Stack Demo</h1>
          <nav>
            <a href="/">Home</a> | <a href="/about">About</a> |{" "}
            <a href="/shop">Shop</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
