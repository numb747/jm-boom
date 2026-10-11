基于上游 v0.4.6 的 fork 构建，包含以下改动。提供 Windows（MSI）和 Linux（deb，x86_64）安装包。

## 功能

- 阅读器支持缩放（30%–400%）：Ctrl + 滚轮、Ctrl + / Ctrl − / Ctrl + 0，或在「阅读设置」中调整；竖向阅读和单页各自记住缩放比例 ([42305bd](https://github.com/numb747/jm-boom/commit/42305bd))
  - 竖向阅读：缩小后页面列变窄、一屏可看多页；缩放时保持当前阅读位置不跳动
  - 单页：缩小后居中显示，放大后可滚动查看，翻页后从页面顶部开始
- 双页阅读支持缩放，与单页共用缩放比例；左右两页改为贴合中缝显示 ([26272ae](https://github.com/numb747/jm-boom/commit/26272ae))

## 优化

无。

## 修复

- 修复单页放大并滚动后，翻回该页时停留在上次滚动位置而不是页面顶部的问题 ([26272ae](https://github.com/numb747/jm-boom/commit/26272ae))
- 修复 Linux 上 WebKitGTK 2.54 中首页一直停在加载骨架屏、无法进入的问题：封面编号角标和阅读器浮层的毛玻璃效果（`backdrop-filter`）会让 WebKit 合成线程陷入死循环（CPU 占满、内存持续增长、画面停止刷新），现已移除 ([312fecf](https://github.com/numb747/jm-boom/commit/312fecf))
- 移除弹窗、抽屉遮罩层的毛玻璃效果，避免同一问题在阅读器章节目录、详情页下载/评论抽屉中触发 ([1b5265b](https://github.com/numb747/jm-boom/commit/1b5265b))
- 修复部分 API 线路（如 `www.cdnhjk.net`、`www.cdnhth.net`）返回带 UTF-8 BOM 的响应导致登录失败、提示 `expected value at line 1 column 1` 的问题 ([12d3bed](https://github.com/numb747/jm-boom/commit/12d3bed))
- 修复 EmptyState 遮罩拦截点击的问题 ([03433f4](https://github.com/numb747/jm-boom/commit/03433f4))

## 其他

- 安装包由 fork 的 GitHub Actions 构建 ([fork-build.yml](https://github.com/numb747/jm-boom/blob/fork-release/.github/workflows/fork-build.yml))，未进行代码签名，Windows 安装时可能出现 SmartScreen 提示。
- 应用内检查更新仍指向上游发布；若通过应用内更新升级到上游版本，将不再包含本 fork 的修复（除非上游也已修复）。
