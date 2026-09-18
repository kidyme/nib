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
pnpm tauri dev                                       # 图标打在二进制里，要重启
```

改的仍然是那一个 SVG，`src-tauri/icons/` 和 `brand/logo/app-icons/` 都是生成物，
不要手改。图标的圆角、留白由 SVG 自己画（macOS 版式：四周留 ~6% 空白）。
