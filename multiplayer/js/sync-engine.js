/**
 * 權威同步器（SyncEngine v2）
 * 策略：Host 維護單一真實狀態，透過 Supabase Realtime Channel 即時推送
 *       Guest 發送輸入，Host 處理遊戲邏輯後廣播結果
 */
const SyncEngine = (() => {
    const INPUT_INTERVAL_MS = 100;    // 每 100ms 發送一次輸入
    const STATE_POLL_MS = 200;        // 每 200ms 拉取權威狀態
    const MAX_INPUTS_QUEUED = 5;      // 最多排隊 5 個未處理輸入

    /**
     * 建立同步器實例
     * @param {object} config
     * @param {string} config.roomCode — 房間碼
     * @param {string} config.roomId — 房間 UUID (nullable — set later)
     * @param {string} config.playerId — 自己的玩家 ID
     * @param {string} config.role — 'host' | 'guest'
     * @param {object} supabaseClient — SupabaseClient 模組
     * @returns {object} 同步器實例
     */
    function create(config) {
        const roomCode = config.roomCode;
        let roomId = config.roomId || null;
        const playerId = config.playerId;
        const role = config.role || 'host';
        const supabaseClient = config.supabaseClient;

        let lastVersion = 0;
        let authoritativeState = null;
        let ownRoomData = null;
        let isRunning = false;

        // Timers & subscriptions
        let inputTimer = null;
        let statePollTimer = null;
        let roomSub = null;
        let stateSub = null;

        // Input queue (guest only)
        let inputQueue = [];
        let lastInputTime = 0;

        // Callbacks (set by the game controller)
        let onOtherStateUpdate = null;
        let onRoomStatusChange = null;
        let onOpponentDisconnected = null;
        let onGameStarted = null;
        let onGameStateSynced = null;

        // ============ BROADCAST MY STATE (Host → Guest) ============
        function broadcastMyState(gameState) {
            if (!isRunning || !roomId) return;

            lastVersion++;
            const serialized = GameStateSerializer.serialize(gameState);

            supabaseClient.saveSnapshot(roomId, playerId, serialized, lastVersion)
                .catch(err => console.error('[SyncEngine] 儲存快照失敗:', err));
        }

        // ============ SEND INPUT (Guest → Host) ============
        function sendInput(inputType) {
            if (!isRunning || !roomId) return;
            if (role !== 'guest') return; // Only guest sends inputs

            const now = Date.now();
            if (now - lastInputTime < INPUT_INTERVAL_MS) return; // Debounce
            lastInputTime = now;

            // Queue input, process when possible
            inputQueue.push({ type: inputType, ts: now });
            if (inputQueue.length > MAX_INPUTS_QUEUED) {
                inputQueue.shift(); // Drop oldest if too many
            }
            processInputQueue();
        }

        function processInputQueue() {
            if (inputQueue.length === 0 || !roomId) return;

            const input = inputQueue.shift();
            supabaseClient.sendPlayerInput(roomId, playerId, input.type, lastVersion)
                .catch(err => {
                    console.warn('[SyncEngine] 輸入傳送失敗:', err);
                    inputQueue.unshift(input); // Re-queue failed input
                });
        }

        // ============ SUBSCRIBE TO OTHER PLAYER ============
        function subscribeToOtherPlayer() {
            if (!supabaseClient.isConnectedState() || !roomId) return;

            stateSub = supabaseClient.subscribeToRoomStates(
                roomId, (payload) => {
                    if (!payload || !payload.snapshot) return;
                    const state = GameStateSerializer.deserialize(payload.snapshot);
                    authoritativeState = state;
                    if (onOtherStateUpdate) onOtherStateUpdate(state);
                }
            );
        }

        // ============ SUBSCRIBE TO ROOM ============
        function subscribeToRoom() {
            if (!supabaseClient.isConnectedState()) return;

            roomSub = supabaseClient.subscribeToRoom(roomCode, (roomData) => {
                ownRoomData = roomData;
                console.log('[SyncEngine] Room update:', roomData?.status, 'guest_id:', roomData?.guest_id);
                if (onRoomStatusChange) onRoomStatusChange(roomData);
            });
        }

        // ============ UPDATE ROOM ID ============
        function updateRoomId(newRoomId) {
            roomId = newRoomId;
            console.log('[SyncEngine] 房間 ID 更新為:', roomId);

            // Re-subscribe to other player state with new room ID
            subscribeToOtherPlayer();
        }

        // ============ START / STOP ============
        function start() {
            isRunning = true;
            subscribeToOtherPlayer();
            subscribeToRoom();

            if (role === 'guest') {
                // Guest: poll for authoritative state periodically
                statePollTimer = setInterval(() => {
                    if (!roomId || !supabaseClient.isConnectedState()) return;
                    supabaseClient.getLatestState(roomId)
                        .then(result => {
                            if (result.state && result.state.player_id !== playerId) {
                                const state = GameStateSerializer.deserialize(result.state.snapshot);
                                authoritativeState = state;
                                if (onOtherStateUpdate) onOtherStateUpdate(state);
                            }
                        })
                        .catch(err => console.warn('[SyncEngine] 取得最新狀態失敗:', err));
                }, STATE_POLL_MS);
            }
        }

        function stop() {
            isRunning = false;

            if (inputTimer) { clearInterval(inputTimer); inputTimer = null; }
            if (statePollTimer) { clearInterval(statePollTimer); statePollTimer = null; }

            if (roomSub) {
                try { supabaseClient.getClient()?.channel(roomSub.id)?.unsubscribe?.(); } catch(e) {}
                roomSub = null;
            }
            if (stateSub) {
                try { supabaseClient.getClient()?.channel(stateSub.id)?.unsubscribe?.(); } catch(e) {}
                stateSub = null;
            }
        }

        // ============ GET AUTHORITY STATE ============
        function getAuthoritativeState() {
            return authoritativeState;
        }

        function getOwnRoomData() {
            return ownRoomData;
        }

        function isRunningCheck() {
            return isRunning;
        }

        // Set callbacks
        function on(otherStateCb, roomCb, disconnectedCb, gameStartedCb, gameStateSyncedCb) {
            onOtherStateUpdate = otherStateCb;
            onRoomStatusChange = roomCb;
            onOpponentDisconnected = disconnectedCb;
            onGameStarted = gameStartedCb;
            onGameStateSynced = gameStateSyncedCb;
        }

        return {
            start,
            stop,
            updateRoomId,
            sendInput,
            broadcastMyState,
            getAuthoritativeState,
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
