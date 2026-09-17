import type { ComponentType } from "react";
import { BookIcon, CheckSquareIcon } from "../shell/icons";
import { TodoApp } from "./todo/TodoApp";
import { DocsApp } from "./docs/DocsApp";

export type AppDefinition = {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  component: ComponentType;
};

/** 侧边栏里的应用列表。加新应用 = 在这里加一项，其余不用动。 */
export const APPS: AppDefinition[] = [
  { id: "todo", name: "TODO", icon: CheckSquareIcon, component: TodoApp },
  { id: "docs", name: "文档中心", icon: BookIcon, component: DocsApp },
];

export const DEFAULT_APP_ID = APPS[0].id;

export function findApp(id: string): AppDefinition {
  return APPS.find((app) => app.id === id) ?? APPS[0];
}
