import type { ComponentType, ReactNode } from "react";

export type RouteModule = {
  get: () => ReactNode | Promise<ReactNode>;
};

export type LayoutComponent = ComponentType<{ children: ReactNode }>;

export type RootComponent = ComponentType<{ children: ReactNode }>;

export type RuntimeMode = "dev" | "prod";

export interface RouteDefinition {
  path: string;
  filePath: string;
  layouts: string[];
}
