# 设计：阅读器内收藏漫画

> 本项目此前没有架构地图；`docs/arch/` 目前只覆盖这个功能涉及的部分，不是全项目总览。

## 目标

读者读到一半觉得不错，想收藏，不必退出阅读器回详情页：点一下屏幕呼出底栏，底栏里直接有「收藏」按钮。

## 决策

1. **位置：底栏按钮行**，和「章节目录」「阅读设置」并排的独立按钮（`ReaderChapterControls` 里），不放进「阅读设置」下拉菜单——收藏不是设置，且要一次点击、状态直接可见。（用户选定）
2. **文案与图标沿用详情页**：未收藏 `BookmarkIcon` +「收藏」；已收藏 `BookmarkCheckIcon` +「已收藏」；请求中禁用。按钮样式与底栏 `CHAPTER_BUTTON_CLASS` 相同，但在按钮文件里另写一份常量（和 `READER_SETTING_BUTTON_CLASS` 的做法一样），避免 `reader-chapter-controls` ↔ `reader-favorite-button` 循环 import。（默认，实现时调整）
3. **再次点击直接取消收藏**，toast「已取消收藏」，与详情页一致，不加二次确认。（用户选定）
4. **未登录：按钮照常显示，点击在阅读器里弹 `LoginDialog`**，登录成功后接着完成收藏。（用户选定）
5. **登录后先重拉详情再决定**：JM 的 `POST /favorite` 是服务端切换（Rust 端只是返回 `!current_favorite`）；未登录时拉到的详情 `isFavorite` 恒为 false，直接切换可能把本来已收藏的漫画取消掉。所以登录成功后先 `refetch` 详情：新状态已收藏 → 只 toast「已在收藏中」；否则再收藏。（默认，防误操作）
6. **状态共享靠现有缓存**：阅读器的 `useReaderChapterInfo` 和详情页用同一个 key `queryKeys.comicDetail(endpoint, albumId)`。收藏成功后 `setQueryData` 写回 `isFavorite`，回到详情页自然显示「已收藏」。收藏页 `refetchOnMount: 'always'`，不用额外 invalidate。（默认）
7. **抽出共享 hook `useComicFavorite`**，放 `src/lib/use-comic-favorite.ts`：把详情页 `page.tsx` 里内联的 `favoriteMutation`（调用、写缓存、toast）搬进去，详情页和阅读器都用它，不复制两份。放 `src/lib` 是因为两个 feature 互不 import。（默认）
8. **`isFavorite` 由 `useReaderChapterInfo` 往下传**：它额外返回 `isFavorite: boolean | null`（null = 详情还没拿到）和 `refetchAlbumDetail`，经 `ReaderBottomBar` → `ReaderChapterControls` 传给按钮，和现有 `albumId` 的传法一致。（默认）
9. **没有 `albumId` 或详情未加载时按钮禁用**：旧历史记录可能没有 albumId，不拿章节 id 去收藏（那是 photo id，不是 album id）。（默认）
10. **`LoginDialog` 挂在底栏里**（和 `ReaderChapterDrawer` 一样），因为 `<footer>` 已经 `stopPropagation`，portal 里的点击不会冒泡到 `<main onClick={toggleToolbar}>` 把工具栏收起。（默认）
11. **键盘翻页加守卫**：`useReaderKeyboardNavigation` 监听 window keydown，目前不区分输入框——弹登录框后 ←/→ 会翻页且吞掉光标移动，竖向模式下连 w/a/s/d 都打不进去，Esc 会关弹窗的同时退出阅读器。改为：`event.defaultPrevented`（Radix 关弹窗时会 preventDefault）或目标是 input / textarea / contenteditable 时直接 return。（默认，弹登录框的前提）
12. **启动自动登录期间按钮禁用**：`useUserStore.isInitializing` 为 true 时 `user` 还是 null，此时点击会误弹登录框。（默认，实现时补充）
13. **登录后重拉失败就报错不收藏**：`refetch` 失败时缓存里还是未登录的旧数据，要看 `result.isError` 而不只是 `data == null`，toast 错误后不再切换。（默认，实现时补充）
14. **底栏保留文字按钮**：第一步实测底栏不拥挤，原「待定」里的仅图标方案不需要。（用户实测确认）
15. **不做**：选择收藏夹（JM 支持多个收藏夹，本次走默认收藏夹，和详情页一致）；收藏快捷键；顶栏图标。

## 待定

无。

## 实现顺序

- [x] 1. **曳光弹：已登录时在阅读器里收藏 / 取消**
  - 新建 `src/lib/use-comic-favorite.ts`：`useComicFavorite(comicId)` → `{ toggle(currentFavorite: boolean), isPending }`，内部 `useMutation` + `setQueryData(comicDetail)` + toast（从 `comic-detail/page.tsx` 搬过来）；详情页改用它。
  - `useReaderChapterInfo` 多返回 `isFavorite`、`refetchAlbumDetail`；经 `ReaderBottomBar` 传到 `ReaderChapterControls`。
  - 新建 `src/features/reader/reader-favorite-button.tsx`：`ReaderFavoriteButton`，放在「阅读设置」后面；此步先不处理未登录。
  - 节点：`fav_hook`、`fav_btn`、流程图里的 `toggle`、`write_cache`、`synced`、`toast_err`。
  - 验证：`bunx tsc --noEmit`；手动：登录状态进阅读器 → 收藏 → 按钮变「已收藏」→ 返回详情页显示「已收藏」→ 详情页取消 → 再进阅读器显示「收藏」。
- [x] 2. **键盘守卫**
  - `use-reader-keyboard-navigation.ts` 的 `handleKeyDown` 开头加 `defaultPrevented` / 可编辑目标判断。
  - 节点：`kb_guard`。
  - 验证：`bunx tsc --noEmit`；手动：竖向模式打开章节目录抽屉按 Esc，只关抽屉不退出阅读器（抽屉也是 Radix，可以先用它验证）。
- [x] 3. **未登录 → 弹登录框 → 登录后收藏**
  - `ReaderFavoriteButton` 读 `useUserStore` 的 `user`；未登录时打开内嵌的 `LoginDialog`，`onLoginSuccess` 里 `await refetchAlbumDetail()`，按新的 `isFavorite` 决定 toast「已在收藏中」或 `toggle(false)`。
  - 节点：`logged_in`、`open_login`、`refetch`、`already`、`toast_exist`。
  - 验证：`bunx tsc --noEmit`；手动：退出登录 → 进阅读器 → 点收藏 → 弹框内能正常输入（含 w/a/s/d、方向键）→ 登录后收藏成功；再测一本已收藏的漫画，登录后提示「已在收藏中」且没有被取消。
