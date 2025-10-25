import type { JSX, ReactNode } from "react";
import type { RuntimeMode } from "../routing/types";

interface PostRootProps {
  children?: ReactNode;
  mode: RuntimeMode;
}

export function PostRoot({ children, mode }: PostRootProps): JSX.Element {
  return (
    <>
      {children}
      {mode === "dev" ? (
        <script type="module" src="/@vite/client" data-the-stack-dev-client />
      ) : null}
    </>
  );
}
