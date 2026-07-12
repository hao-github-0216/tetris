-- Supabase SQL Setup Script for Tetris Multiplayer
-- Run this in your Supabase SQL Editor

-- 建立 rooms 表
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE,
  host_id TEXT NOT NULL,
  guest_id TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立 room_states 表
CREATE TABLE IF NOT EXISTS room_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_states_room_id ON room_states(room_id);
CREATE INDEX IF NOT EXISTS idx_room_states_player_id ON room_states(player_id);

-- 建立自動更新 updated_at 的函數
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 建立 rooms 表 updated_at 觸發器
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 設定 Row Level Security (RLS)
-- 允許所有用戶讀取 rooms 表
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "允許所有人讀取房間" ON rooms FOR SELECT USING (true);

-- 允許創建房間
CREATE POLICY "允許創建房間" ON rooms FOR INSERT WITH CHECK (true);

-- 允許更新房間（只有房主或賓客）
CREATE POLICY "允許更新房間" ON rooms FOR UPDATE USING (
  auth.uid()::text = host_id OR auth.uid()::text = guest_id
);

-- 允許所有用戶讀取 room_states 表
ALTER TABLE room_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "允許所有人讀取狀態" ON room_states FOR SELECT USING (true);

-- 允許創建狀態快照
CREATE POLICY "允許創建狀態" ON room_states FOR INSERT WITH CHECK (true);

-- 為 Supabase Broadcast 設置（使用 Realtime）
-- 在 Supabase 儀表板中啟用 Realtime 並訂閱以下頻道：
-- - room_states_changes
-- - room_status_changes  
-- - broadcast_channel
