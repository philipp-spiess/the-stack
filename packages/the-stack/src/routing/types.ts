import type { ComponentType, ReactNode } from "react";

export type RouteComponent = ComponentType;

export type RouteModule = {
  default: RouteComponent;
};

export type LayoutComponent =
  | ComponentType<{ children: ReactNode }>
  | ((props: { children: ReactNode }) => Promise<ReactNode>);

export type RootComponent = ComponentType<{ children: ReactNode }>;

export type RuntimeMode = "dev" | "prod";

export interface RouteDefinition {
  path: string;
  filePath: string;
  layouts: string[];
}
