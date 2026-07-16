-- ============================================
-- 俄羅斯方塊多人模式 — Supabase 資料庫 Schema
-- ============================================

-- 1. Rooms table (房間資訊)
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT NOT NULL UNIQUE,
    host_id TEXT NOT NULL,
    guest_id TEXT,
    status TEXT NOT NULL DEFAULT 'waiting',
    -- 'waiting': 等待對手
    -- 'playing': 對局進行中
    -- 'finished': 對局結束
    -- 'error': 出錯
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE
);

-- 2. Room states table (遊戲狀態快照)
CREATE TABLE IF NOT EXISTS room_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable Realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_states;

-- 4. Row Level Security (optional — 關閉以方便開發)
-- 開發階段建議先關閉 RLS，上線後再開啟

-- 關閉 rooms 的 RLS
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_states DISABLE ROW LEVEL SECURITY;

-- 索引（加速查詢）
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_states_room_id ON room_states(room_id);
CREATE INDEX IF NOT EXISTS idx_states_player_id ON room_states(player_id);
CREATE INDEX IF NOT EXISTS idx_states_version ON room_states(room_id, version DESC);

-- ============================================
-- 4. Player Inputs table (玩家輸入)
-- 用於 Guest → Host 的輸入傳輸
-- ============================================
CREATE TABLE IF NOT EXISTS player_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    input_type TEXT NOT NULL CHECK (input_type IN ('left','right','down','rotate','hard_drop','hold')),
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立索引（加速查詢）
CREATE INDEX IF NOT EXISTS idx_player_inputs_room_id ON player_inputs(room_id);
CREATE INDEX IF NOT EXISTS idx_player_inputs_player_id ON player_inputs(player_id);
CREATE INDEX IF NOT EXISTS idx_player_inputs_created_at ON player_inputs(created_at);
