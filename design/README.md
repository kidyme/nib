# 品牌设计源文件

## 目录

- `brand/logo/nib-app-icon.svg` —— **图标源文件**（1024×1024），要改图标就改它
- `brand/logo/nib-app-icon-256.png` / `-512.png` —— 从 SVG 导出的成品图，README、商店页用
- `brand/logo/app-icons/` —— 早期生成的一整套图标留档，见下方「改图标」
- `brand/design-v2/`、`brand/candidates/` —— 设计过程稿，只作留档

## 改图标

应用真正用的是 `src-tauri/icons/`，**光换 SVG 不生效**，要重新生成：

```bash
pnpm tauri icon design/brand/logo/nib-app-icon.svg   # 默认输出到 src-tauri/icons/
rm -rf src-tauri/icons/android src-tauri/icons/ios   # 只做桌面端，移动端那套不用留
pnpm tauri dev                                       # ⚠️ dev 模式看不到图标，见下方说明
pnpm tauri build --debug --bundles app               # 想验证图标就打包成 .app
# 打开 src-tauri/target/debug/bundle/macos/nib.app
```

改的仍然是那一个 SVG，`src-tauri/icons/` 和 `brand/logo/app-icons/` 都是生成物，
不要手改。图标的圆角、留白由 SVG 自己画（macOS 版式：四周留 ~6% 空白）。

## 为什么 dev 模式下换图标没反应

`pnpm tauri dev` 只编译出裸可执行文件 `src-tauri/target/debug/nib`，**不生成 `.app` 包**。
没有 bundle 就没有 `CFBundleIconFile`，Dock 里显示的是系统给的通用图标，
跟 `src-tauri/icons/` 里的文件完全无关 —— 怎么重启都不会变。

要看到真实图标，必须打包：

```bash
pnpm tauri build --debug --bundles app     # --bundles app 只出 .app，不出 dmg，快很多
open src-tauri/target/debug/bundle/macos/nib.app
```

正式分发用 `pnpm tauri build`（release + dmg）。
如果同一个路径反复重建、图标还是旧的，那是 macOS 图标缓存，`touch nib.app` 或
`killall Dock` 一下即可。
