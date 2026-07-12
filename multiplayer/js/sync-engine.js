/**
 * 混合同步器（SyncEngine）
 * 策略：每 2 秒快照到 Supabase + 垃圾行即時推送
 */
const SyncEngine = (() => {
    const SNAPSHOT_INTERVAL_MS = 2000;

    /**
     * 建立同步器實例
     * @param {object} config
     * @param {string} config.roomCode — 房間碼
     * @param {string} config.roomId — 房間 UUID (nullable — set later)
     * @param {string} config.playerId — 自己的玩家 ID
     * @param {string} config.otherPlayerId — 對手玩家 ID
     * @param {object} supabaseClient — SupabaseClient 模組
     * @returns {object} 同步器實例
     */
    function create(config) {
        const roomCode = config.roomCode;
        // roomId is nullable at creation — will be set via updateRoomId
        let roomId = config.roomId || null;
        const playerId = config.playerId;
        const otherPlayerId = config.otherPlayerId;

        let lastVersion = 0;
        let otherPlayerState = null;
        let ownRoomData = null;
        let isRunning = false;

        // Timers & subscriptions
        let snapshotTimer = null;
        let roomSub = null;
        let stateSub = null;

        // Callbacks (set by the game controller)
        let onOtherStateUpdate = null;
        let onRoomStatusChange = null;
        let onOpponentDisconnected = null;

        // ============ BROADCAST MY STATE ============
        function broadcastMyState(gameState) {
            if (!isRunning || !roomId) return;

            lastVersion++;
            const serialized = GameStateSerializer.serialize(gameState);

            SupabaseClient.saveSnapshot(roomId, playerId, serialized, lastVersion)
                .catch(err => console.error('[SyncEngine] 儲存快照失敗:', err));
        }

        // ============ SUBSCRIBE TO OTHER PLAYER ============
        function subscribeToOtherPlayer() {
            if (!SupabaseClient.isConnectedState() || !roomId || !otherPlayerId) return;

            stateSub = SupabaseClient.subscribeToOtherPlayerState(
                roomId, otherPlayerId, (payload) => {
                    if (!payload || !payload.snapshot) return;
                    const state = GameStateSerializer.deserialize(payload.snapshot);
                    otherPlayerState = state;
                    if (onOtherStateUpdate) onOtherStateUpdate(state);
                }
            );
        }

        // ============ SUBSCRIBE TO OTHER PLAYER ============
        function subscribeToOtherPlayerId(playerId) {
            // Used when the other player ID becomes available (e.g., host learns guest's ID)
            otherPlayerId = playerId;
            console.log('[SyncEngine] 對手玩家 ID 更新為:', playerId);
            subscribeToOtherPlayer();
        }

        // ============ SUBSCRIBE TO HOST (for guest) ============
        function subscribeToHostState(hostId) {
            // Guest subscribes to host's state updates
            if (!SupabaseClient.isConnectedState() || !roomId) return;

            // Unsubscribe existing if any
            if (stateSub) {
                SupabaseClient.getClient()?.channel(stateSub.id)?.unsubscribe?.();
                stateSub = null;
            }

            stateSub = SupabaseClient.subscribeToOtherPlayerState(
                roomId, hostId, (payload) => {
                    if (!payload || !payload.snapshot) return;
                    const state = GameStateSerializer.deserialize(payload.snapshot);
                    otherPlayerState = state;
                    if (onOtherStateUpdate) onOtherStateUpdate(state);
                }
            );
        }

        // ============ SUBSCRIBE TO ROOM ============
        function subscribeToRoom() {
            if (!SupabaseClient.isConnectedState()) return;

            roomSub = SupabaseClient.subscribeToRoom(roomCode, (roomData) => {
                ownRoomData = roomData;
                if (onRoomStatusChange) onRoomStatusChange(roomData);

                // Detect disconnect: opponent ID doesn't match
                if (ownRoomData && ownRoomData.guest_id !== otherPlayerId) {
                    if (onOpponentDisconnected) onOpponentDisconnected();
                }
            });
        }

        // ============ SEND GARBAGE EVENT ============
        function sendGarbage(count) {
            // In MVP, garbage is delivered via snapshots (clear handling).
            // Advanced: use Supabase Broadcast for instant push.
            console.log('[SyncEngine] 推送垃圾行:', count, 'to', otherPlayerId);
        }

        // ============ UPDATE ROOM ID (called when room is created/joined) ============
        function updateRoomId(newRoomId) {
            roomId = newRoomId;
            console.log('[SyncEngine] 房間 ID 更新為:', roomId);

            // Re-subscribe to other player state with new room ID
            subscribeToOtherPlayer();
        }

        // ============ UPDATE OTHER PLAYER ID ============
        function updateOtherPlayerId(newOtherId) {
            otherPlayerId = newOtherId;
            console.log('[SyncEngine] 對手玩家 ID 更新為:', newOtherId);

            // Re-subscribe to other player state with updated ID
            subscribeToOtherPlayer();
        }

        // ============ START / STOP ============
        function start() {
            isRunning = true;
            subscribeToOtherPlayer();
            subscribeToRoom();
        }

        function stop() {
            isRunning = false;

            if (roomSub) {
                try { SupabaseClient.getClient()?.channel(roomSub.id)?.unsubscribe?.(); } catch(e) {}
                roomSub = null;
            }
            if (stateSub) {
                try { SupabaseClient.getClient()?.channel(stateSub.id)?.unsubscribe?.(); } catch(e) {}
                stateSub = null;
            }
        }

        // ============ GET OTHER STATE ============
        function getOtherState() {
            return otherPlayerState;
        }

        function getOwnRoomData() {
            return ownRoomData;
        }

        function isRunningCheck() {
            return isRunning;
        }

        // Set callbacks
        function on(otherPlayerStateCb, roomCb, disconnectedCb) {
            onOtherStateUpdate = otherPlayerStateCb;
            onRoomStatusChange = roomCb;
            onOpponentDisconnected = disconnectedCb;
        }

        return {
            start,
            stop,
            updateRoomId,
            updateOtherPlayerId,
            subscribeToHostState,
            broadcastMyState,
            sendGarbage,
            getOtherState,
            getOwnRoomData,
            isRunningCheck,
            on
        };
    }

    /** 序列化工具（與 GameCore 配合）*/
    const GameStateSerializer = {
        serialize(state) {
            return GameCore.serialize(state);
        },
        deserialize(jsonStr) {
            return GameCore.deserialize(jsonStr);
        }
    };

    return { create };
})();
