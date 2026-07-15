# Tetris 雙人對戰 — 交接摘要（2026-07-15）

> 給新 session 的開工文件。由檔案現況與 git 歷史整理，未參考舊 session 的模型輸出。

## 任務目標

把現有純前端單人俄羅斯方塊改造成**雙人即時線上對戰**（Supabase 後端）。完整規格、關鍵決策表、六階段實作計畫都在 `TODO.md`——它是本專案的權威計畫書，先讀它。

- 保留單人模式不動（根目錄 `index.html` + `js/`）
- 多人模式全部住在 `multiplayer/` 下
- 匿名＋房間碼制，不做帳號系統；排除排行榜/重播/觀戰

## 目前進度

**TODO.md 六階段的程式骨架已全部存在**（`multiplayer/js/`：`supabase-client.js`、`room-system.js`、`game-core.js`、`sync-engine.js`、`multiplayer-ui.js`、`renderer.js`、`garbage-system.js`＋重用的 sound/combo/hold-piece），資料庫 `schema.sql`/`setup.sql` 也在。**現在處於「反覆修 bug 讓房間流程真正能跑」的階段。**

Git 上有 15 個 multiplayer 修復 commit，除錯軌跡依序是：

1. **landing page 按鈕點不動**（多次迭代，最終用 `<button class='mode-card'>` ＋ inline onclick 解決）
2. **房間碼系統**：`generateRoomCode` 的 const 賦值錯誤、`validateRoomCode` 強化、joinRoom 只查 `waiting` 狀態房間
3. **建房/加入流程 race conditions**（最近的戰場）：
   - host 立即開局 vs guest 以 `guest_id` null 判斷加入（8a5b4d3）
   - 誤導向單人模式 → 改 `startGameLocally`（ea0d845）
   - 重複 `initGame` 造成 waiting→playing race（3e9f818）
   - `PIECES_CONST` getter 被當函式呼叫（250601c）
   - **最後一個 commit（d3c0614）**：`createRoom`/`joinRoom` 前先 `await SupabaseClient.init`，修初始化 race

**Working tree 乾淨**，所有工作都已提交。

## 中斷點（最重要）

舊 session 在提交 d3c0614 之後立刻中斷——**這個 await init 修復做完但「沒有驗證過」**。新 session 的第一件事：

1. 起本地服務（純靜態站，例如 `npx serve` 或 `python3 -m http.server`，或直接 vercel dev——有 `vercel.json`）
2. 開兩個瀏覽器視窗實測完整流程：建房 → 顯示房間碼 → 第二視窗加入 → 雙方進入對局
3. 通了才繼續往下；不通就從 d3c0614 的 race 修復繼續查

## 尚未做／未驗證的部分（對照 TODO.md）

- 階段 4-5 的實際對戰體驗：混合同步（`sync-engine.js`）與主副面板 UI 在真實雙人下未驗證過
- 階段 6 離線處理與邊緣情況：未動工
- 垃圾行規則（`garbage-system.js`）：程式在但未實測
- Supabase RLS 權限（TODO.md §3.2）：確認 `setup.sql` 是否已在 Supabase 專案執行過

## 技術備忘

- Supabase 連線設定在 `multiplayer/js/supabase-client.js`（285 行）
- 部署目標是 Vercel（有 `vercel.json`）
- `package.json` 無 scripts，僅 devDep jsdom（可能供手動測試用）

## 給新 session 的開場白建議

「讀 `HANDOFF.md` 和 `TODO.md`。先起本地伺服器，用兩個視窗驗證建房/加入流程是否已被 d3c0614 修好，回報結果後我們再決定下一步。」
