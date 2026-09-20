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
    loop/             Loop 工作流
    atlas/            Atlas 文档中心（开发中，暂未注册进侧边栏）
src-tauri/            Rust 侧（icons/ 是从品牌 SVG 生成的，别手改）
design/               品牌设计源文件与改图标的步骤
```

Loop 是独立的单人工作流应用，数据只存在 `nib:loop`。第一次打开会带几张示例卡片，
拖一拖就知道这套看板怎么用；不想要了在 Loop 设置的「数据」里「恢复默认数据」即可。列表示卡片在工作流里的位置；
状态是单值属性，标签是多值属性，两者共用同一套 chip 外观；Loop 的主题无关配置
也只在自己的设置里，不写进 nib 全局设置。列的增删改序都在 Loop 设置的「看板」里，
列高跟随窗口，列宽在「显示」里单独配置。

Atlas 是文档导航应用，数据只存在 `nib:atlas`：分组、收藏、搜索都是本地的，文档只存
标题、网址和备注，点一行就用系统默认浏览器打开；删掉分组只会把文档退回「未分组」。
还在开发中，所以先没在 `registry.tsx` 里注册——放开那两行注释它就回来了。

## 外壳

侧边栏默认是 220px 的展开态，直接显示应用名；点左上角的收起按钮会切成 64px 图标栏，
名字改走 `title` 提示，再点标题栏左侧的展开按钮即可恢复。上面是应用列表
（`apps/registry.tsx`），下面固定是「设置」。激活项给一层 `bg-control` 底色，
跟设置页的导航保持同一套。

注册表里标了 `fullscreen: true` 的页面还支持**页面全屏**（不是窗口全屏）：标题栏右侧那个
按钮一按，侧边栏整条收起、内容占满整行；`Ctrl+F` 是同一个开关。标题栏左上角会出现一个
按钮把侧边栏请回来（也就是退出全屏），退出另有 `Ctrl+Shift+F`。全屏只认这两个快捷键和按钮，
`Esc` 只负责关弹窗，不碰全屏。页面全屏时标题栏顶到窗口左边缘，
会自己让出 macOS 红绿灯那块地方（80px），不然按钮会钻到红绿灯底下。

## 设置

侧边栏「设置」打开（默认快捷键是 `⌘,`，在快捷键页里能改）。设置是独立页面：整窗换掉
应用外壳，左边是设置导航（顶部「返回应用」），右边是小节卡片，卡片里一行一个设置项。
四页：

- **字体** —— 内容字体（Loop、文档正文这类要读的内容：字体 / 字号 / 字重 / 行高）
  和系统字体（侧边栏、标题栏、设置界面：字体 / 字号 / 字重）。出厂默认是内置的
  两套（界面 Heiti SC、内容 Chalkboard SE，都是 macOS 自带），在字体列表最前面
  标着「内置」；其余选项来自本机已安装的字样
- **外观** —— 选预设，再逐项改任意实色；「恢复预设」退回当前预设
- **快捷键** —— 打开设置、切换页面全屏、退出页面全屏三个动作各自一个快捷键，点键帽
  直接按新组合录进去，撞车会当场提示；存档在 `nib:shortcuts`
- **数据** —— 整份配置就是一个 JSON，可以复制、导出 `nib-config.json`、导入覆盖

改的是草稿，边改边生效：立刻写到 `<html>` 上，所以设置页里就能看到效果，但还没落盘。
右上角三个按钮：「保存」才写进 `nib:theme` / `nib:fonts`，「还原」退回上次保存的那份，
「恢复默认配置」退回出厂那套（同样只改草稿，点错了「还原」还能退回来）。
不保存直接「返回应用」等于放弃草稿，回到应用还是原来那套。

默认值都写在 `styles.css` 里，用户保存过的值才内联到 `<html>`，所以「默认值」和
「用户配置」只有一个出口。

出厂默认的那一份（「恢复默认配置」回到的就是它）：Everforest 深色 + 上面两套内置字体
（界面 14px / 行高 1.5，内容 16px / 行高 2，整体缩放 125%）+ 默认快捷键。

## 配色

组件只引用语义 token，不写死色值：

```tsx
<div className="bg-surface text-ink-muted border border-line" />
```

可用 token 见 `src/styles.css` 的 `@theme inline` 块：`canvas / surface / raised /
sunken / sidebar / titlebar / line / line-strong / ink / ink-muted / ink-subtle /
ink-inverse / accent / accent-hover / accent-active / accent-fg / accent-soft /
ring / control / control-hover / control-active / button / button-hover /
button-active / focus / success / warning / danger / info / scrollbar`
（状态色另带 `-soft` 变体）。

半透明色（`accent-soft` / `ring` / `control*` / `button*` / 状态色 `-soft`）
全部由实色用 `color-mix` 算出来，不单独配置也不导出——改正文色或主色，
按钮、悬停底色和聚焦圈会自动跟上。

内置两套预设取自 Codex 的主题：`everforest`（深色，surface `#2d353b` / accent
`#a7c080`）和 `github`（浅色 · Codex，surface `#ffffff` / ink `#1a1c1f`），其余色值
按同一色阶补全。老配置里的 `dark` / `light` 会自动换成这两套。

新增一套配色：在 `src/styles.css` 加一个 `[data-theme="id"]` 块填满全部实色
（`--c-*`），再到 `src/theme.ts` 的 `THEMES` 里加一行；需要进设置页让用户逐项
改的话，再往 `COLOR_TOKENS` 里加一条。组件无需改动。

新加的应用，内容区记得套一层 `<div data-font="content">`，才会用「内容字体」
那套配置。
