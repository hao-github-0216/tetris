/**
 * Supabase 客戶端封裝
 * 提供房間和狀態的 CRUD 操作
 */
const SupabaseClient = (() => {
    let supabase = null;
    let isConnected = false;

    /**
     * 初始化 Supabase 客戶端
     * 需要透過環境變數或配置物件提供 URL 和 key
     */
    /**
     * Decode JWT to check the role
     */
    function decodeRole(key) {
        try {
            const payload = key.split('.')[1];
            const decoded = JSON.parse(atob(payload));
            return decoded.role || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    function init(url, key) {
        if (!url || !key) {
            console.warn('[SupabaseClient] 未提供 URL 或 key，多人模式將無法使用');
            return false;
        }

        try {
            const role = decodeRole(key);
            console.log('[SupabaseClient] key role:', role);

            // Dynamically load Supabase JS SDK v2
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = () => {
                // @ts-ignore — supabase is loaded from CDN
                supabase = window.supabase.createClient(url, key);
                isConnected = true;
                if (role === 'service_role') {
                    console.log('[SupabaseClient] 使用 service_role key（具備完整寫入權限）');
                }
                console.log('[SupabaseClient] 已連線至 Supabase');
            };
            script.onerror = () => {
                console.error('[SupabaseClient] 載入 Supabase SDK 失敗');
            };
            document.head.appendChild(script);
            return true;
        } catch (e) {
            console.error('[SupabaseClient] 初始化失敗:', e);
            return false;
        }
    }

    function getClient() {
        return supabase;
    }

    function isConnectedState() {
        return isConnected;
    }

    // ============ ROOM OPERATIONS ============
    /**
     * 建立新房間
     * @param {string} roomCode — 6 碼房間碼
     * @param {string} hostId — 創建者 ID
     * @returns {Promise<{error: string|null, room: object|null}>}
     */
    async function createRoom(roomCode, hostId) {
        if (!supabase) return { error: 'Supabase 未初始化' };

        const { data, error } = await supabase
            .from('rooms')
            .insert({
                room_code: roomCode,
                host_id: hostId,
                status: 'waiting'
            })
            .select()
            .single();

        if (error) return { error: error.message };
        return { error: null, room: data };
    }

    /**
     * 用房間碼加入房間
     * @param {string} roomCode — 6 碼房間碼
     * @param {string} guestId — 加入者 ID
     * @returns {Promise<{error: string|null, room: object|null}>}
     */
    async function joinRoom(roomCode, guestId) {
        if (!supabase) return { error: 'Supabase 未初始化' };

        // Find rooms with status 'waiting' and no guest yet
        const { data: room, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('room_code', roomCode.toUpperCase())
            .eq('status', 'waiting')
            .is('guest_id', null)
            .single();

        if (error || !room) {
            return { error: room ? '房間已不存在或已開始' : '找不到此房間碼' };
        }

        // Update room with guest and set status to 'playing'
        const { data: updated, error: updateError } = await supabase
            .from('rooms')
            .update({
                guest_id: guestId,
                status: 'playing'
            })
            .eq('id', room.id)
            .select()
            .single();

        if (updateError) return { error: updateError.message };
        return { error: null, room: updated };
    }

    /**
     * 查詢房間狀態
     * @param {string} roomCode
     */
    async function getRoom(roomCode) {
        if (!supabase) return { error: 'Supabase 未初始化' };

        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('room_code', roomCode.toUpperCase())
            .single();

        if (error) return { error: error.message };
        return { error: null, room: data };
    }

    /**
     * 更新房間狀態
     * @param {string} roomId
     * @param {string} newStatus — 'playing', 'finished', etc.
     * @returns {Promise<{error: string|null}>}
     */
    async function updateRoomStatus(roomId, newStatus) {
        if (!supabase) return { error: 'Supabase 未初始化' };

        const { error } = await supabase
            .from('rooms')
            .update({ status: newStatus })
            .eq('id', roomId);

        return { error: error ? error.message : null };
    }

    /**
     * 訂閱房間變更（Realtime）
     * @param {string} roomCode
     * @param {function} callback — 收到更新時呼叫
     * @returns {object} subscription 物件
     */
    function subscribeToRoom(roomCode, callback) {
        if (!supabase) return null;

        return supabase
            .channel('rooms:' + roomCode)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'rooms',
                filter: `room_code=eq.${roomCode.toUpperCase()}`
            }, (payload) => {
                callback(payload.new);
            })
            .subscribe();
    }

    // ============ STATE OPERATIONS ============
    /**
     * 儲存遊戲狀態快照
     * @param {string} roomId — 房間 ID
     * @param {string} playerId — 玩家 ID
     * @param {object} snapshot — 遊戲狀態 JSON
     * @param {number} version — 版本號
     */
    async function saveSnapshot(roomId, playerId, snapshot, version) {
        if (!supabase) return { error: 'Supabase 未初始化' };

        const { data, error } = await supabase
            .from('room_states')
            .insert({
                room_id: roomId,
                player_id: playerId,
                snapshot: snapshot,
                version: version
            })
            .select()
            .single();

        if (error) return { error: error.message };
        return { error: null, state: data };
    }

    /**
     * 取得對方的最新狀態
     * @param {string} roomId
     * @param {string} otherPlayerId
     */
    async function getOtherPlayerState(roomId, otherPlayerId) {
        if (!supabase) return { error: 'Supabase 未初始化' };

        const { data, error } = await supabase
            .from('room_states')
            .select('*')
            .eq('room_id', roomId)
            .eq('player_id', otherPlayerId)
            .order('version', { ascending: false })
            .limit(1)
            .single();

        if (error) return { error: null, state: null };
        return { error: null, state: data };
    }

    /**
     * 訂閱對方的狀態更新（Realtime）
     * @param {string} roomId
     * @param {string} otherPlayerId
     * @param {function} callback
     */
    function subscribeToOtherPlayerState(roomId, otherPlayerId, callback) {
        if (!supabase) return null;

        return supabase
            .channel('room_states:' + roomId + ':' + otherPlayerId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'room_states',
                filter: `room_id=eq.${roomId} AND player_id=eq.${otherPlayerId}`
            }, (payload) => {
                callback(payload.new);
            })
            .subscribe();
    }

    /**
     * 結束對局
     * @param {string} roomId
     * @param {string} status — 'finished' | 'error'
     */
    async function finishRoom(roomId, status) {
        if (!supabase) return { error: 'Supabase 未初始化' };

        const { error } = await supabase
            .from('rooms')
            .update({ status: status, finished_at: new Date().toISOString() })
            .eq('id', roomId);

        return { error: error ? error.message : null };
    }

    return {
        init,
        getClient,
        isConnectedState,
        createRoom,
        joinRoom,
        getRoom,
        updateRoomStatus,
        subscribeToRoom,
        saveSnapshot,
        getOtherPlayerState,
        subscribeToOtherPlayerState,
        finishRoom
    };
})();
