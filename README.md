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
  styles.css          配色预设 + 字体变量 + 基础样式（色值的唯一来源）
  theme.ts            配色状态：读预设、写内联覆盖、持久化、导入校验
  fonts.ts            系统字体 / 内容字体状态与持久化
  shell/              窗口外壳：侧边栏、标题栏、应用切换、占位组件、图标
  settings/           设置页（独立页面，左侧设置导航 + 右侧内容）
  apps/
    registry.tsx      应用注册表（加应用改这里）
    todo/             待办
    docs/             文档中心
src-tauri/            Rust 侧（icons/ 是从品牌 SVG 生成的，别手改）
design/               品牌设计源文件与改图标的步骤
```

## 设置

侧边栏「设置」或 `⌘,` 打开。设置是独立页面：整窗换掉应用外壳，左边是设置导航
（顶部「返回应用」），右边是小节卡片，卡片里一行一个设置项。三页：

- **字体** —— 内容字体（TODO、文档正文这类要读的内容：字体 / 字号 / 字重 / 行高）
  和系统字体（侧边栏、标题栏、设置界面：字体 / 字号 / 字重）
- **外观** —— 选预设，再逐项改任意实色；「恢复预设」退回当前预设
- **数据** —— 整份配置就是一个 JSON，可以复制、导出 `nib-config.json`、导入覆盖

改的是草稿，边改边生效：立刻写到 `<html>` 上，所以设置页里就能看到效果，但还没落盘。
右上角「保存」才写进 `nib:theme` / `nib:fonts`，「还原」退回上次保存的那份，
不保存直接「返回应用」同样等于放弃草稿。

默认值都写在 `styles.css` 里，用户保存过的值才内联到 `<html>`，所以「默认值」和
「用户配置」只有一个出口。

## 配色

组件只引用语义 token，不写死色值：

```tsx
<div className="bg-surface text-ink-muted border border-line" />
```

可用 token 见 `src/styles.css` 的 `@theme inline` 块：`canvas / surface / raised /
sunken / sidebar / titlebar / line / line-strong / ink / ink-muted / ink-subtle /
ink-inverse / accent / accent-hover / accent-active / accent-fg / accent-soft /
ring / success / warning / danger / info / scrollbar`（状态色另带 `-soft` 变体）。

半透明色（`accent-soft` / `ring` / 状态色 `-soft`）全部由实色用 `color-mix`
算出来，不单独配置也不导出——改主色，悬停底色和聚焦圈会自动跟上。

内置两套预设取自 Codex 的主题：`everforest`（深色，surface `#2d353b` / accent
`#a7c080`）和 `github`（浅色，surface `#ffffff` / accent `#0969da`），其余色值
按同一色阶补全。老配置里的 `dark` / `light` 会自动换成这两套。

新增一套配色：在 `src/styles.css` 加一个 `[data-theme="id"]` 块填满全部实色
（`--c-*`），再到 `src/theme.ts` 的 `THEMES` 里加一行；需要进设置页让用户逐项
改的话，再往 `COLOR_TOKENS` 里加一条。组件无需改动。

新加的应用，内容区记得套一层 `<div data-font="content">`，才会用「内容字体」
那套配置。
