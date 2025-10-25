import type { ReactNode } from "react";
import type { RuntimeMode } from "../routing/types";

interface PostRootProps {
  children: ReactNode;
  mode: RuntimeMode;
}

export function PostRoot({ children, mode }: PostRootProps) {
  return (
    <>
      {children}
      {mode === "dev" ? (
        <script type="module" src="/@vite/client" data-the-stack-dev-client />
      ) : null}
    </>
  );
}
