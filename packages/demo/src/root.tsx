import type { ReactNode } from "react";
import { Link } from "the-stack/runtime";
import appCss from "./styles.css?url";

export default function App({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="stylesheet" href={appCss} />
        <title>The Stack Demo</title>
      </head>
      <body>
        <header>
          <h1>The Stack Demo</h1>
          <nav>
            <Link to="/">Home</Link> | <Link to="/about">About</Link> |{" "}
            <Link to="/shop">Shop</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
