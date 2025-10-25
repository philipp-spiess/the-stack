import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <p>Welcome to the marketing pages.</p>
      <div>{children}</div>
    </section>
  );
}
