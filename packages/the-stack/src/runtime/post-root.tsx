import type { JSX, ReactNode } from "react";
import type { RuntimeMode } from "../routing/types";
import { routerClientSource } from "./router-script";

interface PostRootProps {
  children?: ReactNode;
  mode: RuntimeMode;
}

export function PostRoot({ children, mode }: PostRootProps): JSX.Element {
  return (
    <>
      {children}
      <script
        type="module"
        data-the-stack-router=""
        dangerouslySetInnerHTML={{ __html: routerClientSource }}
      />
      {mode === "dev" ? (
        <script type="module" src="/@vite/client" data-the-stack-dev-client />
      ) : null}
    </>
  );
}
