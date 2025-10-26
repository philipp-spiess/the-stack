import type { AnchorHTMLAttributes, ReactNode } from "react";

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  children?: ReactNode;
  native?: boolean;
  replace?: boolean;
}

export function Link({ to, native, replace, children, ...rest }: LinkProps) {
  const dataAttrs = native
    ? {}
    : {
        "data-stack-link": "true",
        "data-stack-replace": replace ? "true" : undefined,
      };

  return (
    <a href={to} {...dataAttrs} {...rest}>
      {children}
    </a>
  );
}
