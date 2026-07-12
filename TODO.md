# 俄羅斯方塊 — 雙人對戰模式開發計畫書

> 創建日期：2025-07-10
> 專案：現有的純前端單人俄羅斯方塊 → 改造成雙人即時線上對戰
> 後端：Supabase

---

## 一、專案概覽

### 現況
- 純前端單人俄羅斯方塊，單一 `index.html` + 4 個 JS 模組（sound, highscore, hold-piece, combo）
- 使用 localStorage 存最高分
- 有音效、hold piece、combo 系統
- 響應式設計，支援桌面和手機
- 零後端

### 目標
將遊戲改造成支援**雙人即時線上對戰**的系統，使用 Supabase 作為後端。

### 範圍
- ✅ 包含：雙人對抗模式、房間碼系統、混合同步機制、主副面板 UI、簡化垃圾行規則、離線處理
- ❌ 排除：全域排行榜、遊戲重播、觀戰模式、使用者帳號系統（匿名 + 房間碼即可）
- ✅ 保留：現有單人模式完整保留，不做改動

---

## 二、關鍵決策（使用者確認）

| # | 決策 | 選擇 | 說明 |
|---|------|------|------|
| 1 | 玩法模式 | **B（對抗模式）** | 消行送垃圾行，雙方互相干擾 |
| 2 | 網路同步 | **C（混合模式）** | 常規狀態每 2 秒快照 + 垃圾行即時推送 |
| 3 | 匹配方式 | **A（房間碼系統）** | 創建房間 → 取得房間碼 → 對手輸入加入 |
| 4 | 垃圾行規則 | **C（簡化規則）** | 每消 1 行送 1 行垃圾行（每行 1 個隨機空洞） |
| 5 | UI 佈局 | **B（主副面板）** | 己方全螢幕主面板 + 對方小面板在角落 |
| 6 | 單人模式 | **A（保留單人模式）** | 現有功能完整保留，不做改動 |
| 7 | 開發範圍 | **一階 MVP 一次做完** | 包含房間系統、對戰同步、主副面板 UI、垃圾行實作、離線處理 |

---

## 三、Supabase 資料庫設計

### 3.1 表結構

#### `rooms` 表 — 房間資訊
```sql
create table rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,  -- 6 碼房間碼（例：TET7A3）
  host_id text not null,           -- 創建者 ID（用裝置 + 時間戳生成的亂碼）
  guest_id text null,              -- 加入者 ID（null = 等待中）
  status text not null default 'waiting',  -- 'waiting' | 'playing' | 'finished' | 'error'
  version int not null default 0,  -- 同步版本號
  created_at timestamptz default now(),
  finished_at timestamptz null
);

create index idx_rooms_status ON rooms(status) where status = 'waiting';
create index idx_rooms_code on rooms(room_code);
```

#### `room_states` 表 — 玩家狀態快照
```sql
create table room_states (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_id text not null,
  snapshot jsonb not null,  -- { board, currentPiece, nextPieceType, score, level, linesCleared, bag, heldPiece }
  version int not null,
  timestamp timestamptz default now()
);

create index idx_room_states_room_version on room_states(room_id, version desc);
```

### 3.2 權限設定（Row Level Security）

- 讀取 `rooms`：public（只讀 waiting 和 finished 的房間）
- 讀取 `room_states`：只能讀自己所在 room 的資料
- 寫入 `room_states`：只能寫自己 player_id 的資料
- 寫入 `rooms`：只有創建者可修改自己的房間

---

## 四、檔案結構規劃

```
tetris/
├── index.html                          # 現有單人版（不改動）
├── multiplayer/                        # 新增：雙人對戰
│   ├── index.html                      # 多人遊戲主頁面
│   └── js/
│       ├── supabase-client.js          # Supabase 客戶端封裝
│       ├── room-system.js              # 房間碼系統（創建/加入/驗證）
│       ├── sync-engine.js              # 混合同步器（狀態快照 + 事件推送）
│       ├── garbage-system.js           # 垃圾行系統
│       └── multiplayer-ui.js           # 主副面板 UI
```

### 對現有的依賴
- 雙人模式的核心遊戲邏輯（PIECES 定義、碰撞檢測、消行、渲染）**重用到** `multiplayer/js/` 中
- 音效模組（sound.js）**重用到** 多人模式
- 最高分模組（highscore.js）**不重用**（多人對戰不存本地最高分）
- Hold 模組（hold-piece.js）和 Combo 模組（combo.js）**重用到** 多人模式

---

## 五、實作順序與詳細步驟

### 階段 1：Supabase 基礎設施（資料庫 + 客戶端）

**步驟 1.1：建立 Supabase 專案**
- 註冊 Supabase 帳號（free tier 足夠）
- 建立新專案
- 取得 project URL 和 anon key

**步驟 1.2：建立資料庫表結構**
```sql
-- 執行於 Supabase SQL Editor

-- 房間表
create table rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  host_id text not null,
  guest_id text null,
  status text not null default 'waiting',
  version int not null default 0,
  created_at timestamptz default now(),
  finished_at timestamptz null
);
create index idx_rooms_status ON rooms(status) where status = 'waiting';
create index idx_rooms_code on rooms(room_code);

-- 玩家狀態表
create table room_states (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_id text not null,
  snapshot jsonb not null,
  version int not null,
  timestamp timestamptz default now()
);
create index idx_room_states_room_version on room_states(room_id, version desc);
```

**步驟 1.3：設定 Row Level Security**
```sql
-- 啟用 RLS
alter table rooms enable row level security;
alter table room_states enable row level security;

-- Rooms 策略
create policy "任何人可讀 waiting 和 finished 的房間"
  on rooms for select
  using (status in ('waiting', 'finished'));

create policy "只有創建者可修改自己的房間"
  on rooms for all
  using (host_id = auth.uid()::text);  -- 如果不用 auth，改為字串比對

-- Room_states 策略
create policy "只能讀同房的狀態"
  on room_states for select
  using (room_id in (select id from rooms where host_id = auth.uid()::text or guest_id = auth.uid()::text));

create policy "只能寫自己的狀態"
  on room_states for insert
  with check (player_id = auth.uid()::text);

create policy "只能更新自己的狀態"
  on room_states for update
  using (player_id = auth.uid()::text);
```

**步驟 1.4：建立 `multiplayer/js/supabase-client.js`**
- 封裝 Supabase 客戶端初始化
- 提供方法：`createRoom()`, `joinRoom(roomCode)`, `getRoom(roomCode)`, `saveSnapshot()`, `subscribeToRoom()`
- 使用 Supabase JS SDK v2

---

### 階段 2：房間碼系統

**步驟 2.1：建立 `multiplayer/js/room-system.js`**

房間碼生成規則：
- 6 碼大寫英文 + 數字（例：TET7A3）
- 前 3 碼固定 "TET"，後 3 碼從 36 進位生成（避免歧義字母 O/I）

核心函數：
```javascript
// 生成房間碼
function generateRoomCode() { ... }

// 驗證房間碼格式
function validateRoomCode(code) { ... }

// 創建房間 → 呼叫 Supabase 寫入 rooms 表
function createRoom() { ... }

// 加入房間 → 用房間碼查詢 rooms 表，如果 status='waiting' 則 guest_id 設為自己
function joinRoom(roomCode) { ... }

// 檢查房間狀態
function getRoomStatus(roomCode) { ... }
```

**步驟 2.2：建立 Lobby 頁面 UI（HTML）**
- 主頁面：「創建房間」和「加入房間」兩個按鈕
- 創建後顯示房間碼 + 分享按鈕
- 加入時輸入房間碼，檢查有效性和可加入性
- 進入等待畫面：顯示「等待對手中...」

---

### 階段 3：核心遊戲引擎抽取

**步驟 3.1：建立 `multiplayer/js/game-core.js`**
- 從現有的 `index.html` 中提取純遊戲邏輯（不依賴 DOM 的部分）
- 包含：PIECES 定義、createPiece、collides、move、rotate、hardDrop、lockPiece、clearLines、spawnPiece
- 包含：getDropInterval、LINE_POINTS 等常數
- 不含 Canvas 渲染、DOM 操作、事件監聽
- 導出純 JavaScript 物件，方便多人模式 import

**步驟 3.2：建立 `multiplayer/js/renderer.js`**
- 對應現有 `index.html` 的 Canvas 渲染部分
- 包含：drawBlock、drawBoard、drawNextPiece、drawGhostPiece
- 支援兩個 canvas：主面板 + 副面板（對方遊戲）
- 包含：響應式縮放邏輯

**步驟 3.3：重用現有模組**
- 音效（SoundModule）→ 直接 copy 到 `multiplayer/js/`
- Hold 模組（HoldModule）→ 直接 copy 到 `multiplayer/js/`
- Combo 模組（ComboModule）→ 直接 copy 到 `multiplayer/js/`

---

### 階段 4：混合同步器實作

**步驟 4.1：建立 `multiplayer/js/sync-engine.js`**

混合同步策略：

#### 常規狀態同步（每 2 秒）
- 每 2 秒將自己的完整遊戲狀態序列化為 JSON
- 寫入 `room_states` 表（新 version）
- 訂閱對方的 `room_states` 變更，收到後反序列化並渲染

#### 垃圾行即時推送（Supabase Broadcast）
- 當自己消行時，計算對方應收到的垃圾行數
- 透過 Supabase Broadcast API 即時推送 `garbage_received` 事件
- 對方收到後立即在自己的遊戲中插入垃圾行

#### 新方塊同步
- 當生成新方塊時，如果對方的 7-bag 隨機種子与自己不同，需要同步隨機種子
- 這部分較為進階，MVP 可以先用「定期狀態快照校準」來處理

**核心函數：**
```javascript
class SyncEngine {
  constructor(roomCode, playerId) {
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.lastVersion = 0;
    this.otherPlayerState = null;
  }

  // 定期將自己的狀態同步到 Supabase（每 2 秒）
  broadcastMyState(gameState) { ... }

  // 訂閱對方的狀態更新
  subscribeToOtherPlayer() { ... }

  // 當自己消行時，推送垃圾行事件
  sendGarbage(count) { ... }

  // 收到對方送回來的垃圾行
  receiveGarbage(lines) { ... }
}
```

**步驟 4.2：建立垃圾行系統 `multiplayer/js/garbage-system.js`**

垃圾行規則（簡化）：
- 每消 1 行，產生 1 行垃圾行
- 垃圾行格式：10 格中有 1 格是空的（洞的位置隨機）
- 每行灰色填充，洞的位置標記為透明

```javascript
class GarbageSystem {
  // 根據消行數生成垃圾行
  generateGarbageLines(count) {
    // 每行：[1,1,1,0,1,1,1,1,1,1] 其中 0 是洞
    return Array(count).fill(null).map(() => this.generateOneGarbageLine());
  }

  // 生成一行垃圾行（10 格，1 個隨機空洞）
  generateOneGarbageLine() {
    const holeIndex = Math.floor(Math.random() * COLS);
    const line = Array(COLS).fill(1);
    line[holeIndex] = 0;
    return line;
  }

  // 將垃圾行插入對方版面頂部
  insertGarbageLines(board, lines) { ... }

  // 檢查對方是否填平了自己的垃圾行（當填平一行時移除對應的垃圾行）
  processGarbageRowClear(board, clearedRows) { ... }
}
```

**雙方垃圾行處理流程：**
1. 玩家 A 消了 N 行 → A 的遊戲插入 N 行垃圾行（灰色，有洞）
2. 同時，A 透過 Broadcast 發送 `garbage_received: N` 事件
3. 玩家 B 收到事件 → 在自己的遊戲版面頂部插入 N 行垃圾行
4. 當 B 用正常方塊填平垃圾行並消行時，正常計分

---

### 階段 5：主副面板 UI

**步驟 5.1：建立 `multiplayer/js/multiplayer-ui.js`**

雙人 UI 布局：
- **主面板**：全螢幕大小的 Canvas 1（自己的遊戲）
- **副面板**：160×160 像素的 Canvas 2（對手的遊戲，置於畫面右上角）
- **頂部資訊列**：房間碼、自己的分數/等級、對方的分數/等級
- **垃圾行預警**：當有垃圾行即將到來時，副面板閃爍紅光
- **狀態提示**：「等待中」→「對戰中」→「遊戲結束」

```javascript
class MultiplayerUI {
  constructor(roomCode, playerId) {
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.myBoardCanvas = document.getElementById('main-canvas');
    this.otherBoardCanvas = document.getElementById('opponent-canvas');
  }

  // 建立 Lobby 頁面
  showLobby() { ... }

  // 顯示等待畫面
  showWaiting(roomCode) { ... }

  // 顯示對戰畫面（主面板 + 副面板）
  showGame() { ... }

  // 更新自己的分數/等級/行數
  updateMyStats(score, level, lines) { ... }

  // 更新對方的分數/等級/行數（從同步資料）
  updateOtherStats(snapshot) { ... }

  // 顯示垃圾行即將到來預警
  showGarbageWarning(lines) { ... }

  // 顯示遊戲結束畫面
  showGameOver(result) { ... }
}
```

**步驟 5.2：建立 `multiplayer/index.html`**
- 結構：Lobby 頁面（創建/加入）→ 等待頁面 → 對戰頁面
- 嵌入所需的 JS 模組
- 響應式設計：手機版將副面板移到側邊

---

### 階段 6：離線處理與邊緣情況

**步驟 6.1：處理離線**
- 偵測 Supabase 連線中斷 → 進入「離線模式」
- 離線期間：自己繼續玩，但無法看到對方狀態
- 重新連線後：從最近的快照重新同步

**步驟 6.2：對局結束**
- 當任一玩家的遊戲結束時，對方的遊戲也強制結束
- 顯示「遊戲結束」畫面，包含雙方的最終分數
- 更新 `rooms` 表的 `status` 為 `'finished'`

**步驟 6.3：防止作弊（基本）**
- 不驗證遊戲邏輯（MVP 不需防作弊），但記錄最終分數於 `room_states`
- 服務端不處理遊戲邏輯（僅轉發狀態）

---

## 六、技術細節

### 6.1 專案結構
```
tetris/
├── index.html                          # 現有的單人模式（不改動）
├── TODO.md                             # 本計畫書
└── multiplayer/                        # 新增：雙人對戰
    ├── index.html                      # 多人遊戲主頁面（Lobby + 對戰 UI）
    └── js/
        ├── supabase-client.js          # Supabase 客戶端封裝
        ├── room-system.js              # 房間碼系統
        ├── game-core.js                # 純遊戲邏輯（不依賴 DOM）
        ├── renderer.js                 # Canvas 渲染
        ├── sync-engine.js              # 混合同步器
        ├── garbage-system.js           # 垃圾行系統
        └── multiplayer-ui.js           # 主副面板 UI
```

### 6.2 現有模組重用

| 模組 | 檔案 | 重用方式 |
|------|------|---------|
| 音效 | `js/sound.js` | 直接 copy 到 `multiplayer/js/` |
| Hold | `js/hold-piece.js` | 直接 copy 到 `multiplayer/js/` |
| Combo | `js/combo.js` | 直接 copy 到 `multiplayer/js/` |
| 最高分 | `js/highscore.js` | 不重用 |
| 遊戲核心 | `index.html` 內的遊戲邏輯 | 重構為 `game-core.js` |
| 渲染 | `index.html` 內的 Canvas 渲染 | 重構為 `renderer.js` |

### 6.3 網路同步流程圖

```
┌──────────────┐                          ┌──────────────┐
│   玩家 A     │                          │   玩家 B     │
│  (創建房間)  │                          │  (加入房間)  │
└──────┬───────┘                          └──────┬───────┘
       │                                         │
       │  1. 創建房間 → rooms 表                 │  2. 輸入房間碼 → 查詢 rooms 表
       │         guest_id 設為 null              │  3. 將自己的 player_id 設為 guest_id
       │                                         │
       │         ┌───────────┐                   │
       │         │ Supabase  │                   │
       │         └───────────┘                   │
       │                                         │
       │  4. 雙方都看到 status = 'playing'       │
       │         開始遊戲                        │
       │                                         │
       │  5. 每 2 秒：快照 → room_states 表      │  6. 每 2 秒：讀取 room_states 表
       │         寫入自己的狀態                  │  讀取對方的狀態並渲染
       │                                         │
       │  7. 消行時 → Broadcast → garbage_received│  8. 收到 → 在自己的版面插入垃圾行
       │         事件                            │
       │                                         │
```

---

## 七、預期成果

- 完成後，兩個使用者可以透過房間碼結對進入同一場對戰
- 雙方同時進行自己的遊戲，但能即時看到對方的遊戲狀態
- 消行會送回垃圾行給對方，增加對戰趣味性
- 手機和桌面都能遊玩
- 現有單人模式完全不受影響

---

## 八、風險與注意事項

1. **延遲問題**：Supabase 的 Realtime 訂閱有約 100-300ms 的延遲，對戰節奏快的時候可能感覺到。緩解：2 秒快照校準。
2. **資費**：Supabase free tier 每個月有上限。預計雙人對戰的流量很小，free tier 足夠。
3. **DevOps**：需要建立 Supabase 專案、設定資料庫表和 RLS。這是最前期的成本。
4. **重複實作**：單人模式和雙人模式的遊戲核心共用，但 UI 獨立。需要確保同步不會導致 UI 混亂。

</antml>

</antThinking>

這份計畫書剛剛存入 `TODO.md`，現在開始實作！

我按步驟來：

**第一步**：建立 `multiplayer/` 目錄和檔案結構。

先建立所有需要的檔案骨架，然後逐步填充內容。

</antml>

<tool_call>
<function=bash>
<parameter=command>
mkdir -p /Volumes/External/projects/tetris/multiplayer/js