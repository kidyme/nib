# nib

macOS 个人工作台。

## 技术栈

Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS 4

## 开发

```bash
pnpm install
pnpm tauri dev     # 桌面端
pnpm dev           # 只跑前端（浏览器里调试界面）
pnpm build         # 类型检查 + 前端构建
pnpm tauri build   # 产出 .app / .dmg
```

## 结构

```
src/
  styles.css          配色 token 定义 + 各套预设 + 基础样式
  theme.ts            主题切换与持久化
  shell/              窗口外壳：侧边栏、应用切换、占位组件、图标
  apps/
    registry.tsx      应用注册表（加应用改这里）
    todo/             待办
    docs/             文档中心
src-tauri/            Rust 侧
```

## 配色

组件只引用语义 token，不写死色值：

```tsx
<div className="bg-surface text-ink-muted border border-line" />
```

可用 token 见 `src/styles.css` 的 `@theme inline` 块：`canvas / surface / raised /
sunken / sidebar / overlay / line / line-strong / ink / ink-muted / ink-subtle /
ink-inverse / accent / accent-hover / accent-active / accent-fg / accent-soft /
ring / success / warning / danger / info`（状态色另带 `-soft` 变体）。

新增一套配色：在 `src/styles.css` 加一个 `[data-theme="id"]` 块填满全部
token，再到 `src/theme.ts` 的 `THEMES` 里加一行。组件无需改动。
