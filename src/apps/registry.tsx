import type { ComponentType } from "react";
import { LoopIcon } from "../shell/icons";
import { LoopApp } from "./loop/LoopApp";
// Atlas 还在开发中，先不注册，代码留在 apps/atlas 等做完再挂回来：
// import { BookIcon } from "../shell/icons";
// import { AtlasApp } from "./atlas/AtlasApp";

export type AppDefinition = {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  component: ComponentType;
  /** 支持页面全屏：藏掉侧边栏让内容占满整行，标题栏上出全屏按钮。 */
  fullscreen?: boolean;
};

/** 侧边栏里的应用列表。加新应用 = 在这里加一项，其余不用动。 */
export const APPS: AppDefinition[] = [
  { id: "loop", name: "Loop", icon: LoopIcon, component: LoopApp, fullscreen: true },
  // 开发中的 Atlas 不挂出来（放开下面这行就回来了）：
  // { id: "atlas", name: "Atlas", icon: BookIcon, component: AtlasApp, fullscreen: true },
];

export const DEFAULT_APP_ID = APPS[0].id;

export function findApp(id: string): AppDefinition {
  return APPS.find((app) => app.id === id) ?? APPS[0];
}
