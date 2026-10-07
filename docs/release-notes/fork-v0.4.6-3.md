基于上游 v0.4.6 的 fork 构建，包含以下修复。提供 Windows（MSI）和 Linux（deb，x86_64）安装包。

## 功能

无。

## 优化

无。

## 修复

- 修复部分 API 线路（如 `www.cdnhjk.net`、`www.cdnhth.net`）返回带 UTF-8 BOM 的响应导致登录失败、提示 `expected value at line 1 column 1` 的问题 ([12d3bed](https://github.com/numb747/jm-boom/commit/12d3bed))
- 修复 EmptyState 遮罩拦截点击的问题 ([03433f4](https://github.com/numb747/jm-boom/commit/03433f4))

## 其他

- 安装包由 fork 的 GitHub Actions 构建 ([fork-build.yml](https://github.com/numb747/jm-boom/blob/fork-release/.github/workflows/fork-build.yml))，未进行代码签名，Windows 安装时可能出现 SmartScreen 提示。
- 应用内检查更新仍指向上游发布；若通过应用内更新升级到上游版本，将不再包含本 fork 的修复（除非上游也已修复）。
