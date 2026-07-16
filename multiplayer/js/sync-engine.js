/**
 * 權威同步器（SyncEngine v2）
 * 策略：Host 維護單一真實狀態，透過 Supabase Realtime Channel 即時推送
 *       Guest 發送輸入，Host 處理遊戲邏輯後廣播結果
 */
const SyncEngine = (() => {
    const INPUT_INTERVAL_MS = 100;    // 每 100ms 發送一次輸入
    const INPUT_CONSUME_MS = 150;     // 每 150ms 消費一次輸入
    const MAX_INPUTS_QUEUED = 5;      // 最多排隊 5 個未處理輸入
    const HEARTBEAT_INTERVAL_MS = 5000; // 心跳間隔
    const MAX_HEARTBEAT_FAILURES = 5;   // 連續失敗 5 次後判定斷線 (~25秒)

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
        let inputConsumeTimer = null;
        let heartbeatTimer = null;
        let roomSub = null;
        let stateSub = null;

        // Input queue (guest only)
        let inputQueue = [];
        let lastInputTime = 0;

        // Track processed guest inputs on host side (bounded to prevent memory leak)
        let processedGuestVersions = [];
        const MAX_PROCESSED_RECORDS = 100;

        // Callbacks (set by the game controller)
        let onOtherStateUpdate = null;
        let onRoomStatusChange = null;
        let onOpponentDisconnected = null;
        let onGameStarted = null;
        let onGameStateSynced = null;
        let onGameInput = null;

        // Heartbeat & disconnect tracking
        let consecutiveHeartbeatFailures = 0;
        let lastOpponentActivityTime = Date.now();

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
            lastVersion++; // Increment version for deduplication

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
        function subscribeToOtherPlayer(otherPlayerId) {
            if (!supabaseClient.isConnectedState() || !roomId) return;

            // Clean old subscription before creating new one
            if (stateSub) {
                try {
                    const client = supabaseClient.getClient();
                    if (client && client.channel) {
                        try { client.channel(stateSub.id)?.unsubscribe?.(); } catch(e) {}
                    }
                } catch(e) {}
                stateSub = null;
            }

            if (otherPlayerId) {
                // Precise filter: only receive updates from the specific opponent
                stateSub = supabaseClient.subscribeToOtherPlayerState(
                    roomId, otherPlayerId, (payload) => {
                        if (!payload || !payload.snapshot) return;
                        lastOpponentActivityTime = Date.now();
                        consecutiveHeartbeatFailures = 0; // Reset on any successful activity
                        const state = GameStateSerializer.deserialize(payload.snapshot);
                        authoritativeState = state;
                        if (onOtherStateUpdate) onOtherStateUpdate(state);
                    }
                );
            } else {
                // Fallback: broad filter (used during initialization before we know opponent ID)
                stateSub = supabaseClient.subscribeToRoomStates(
                    roomId, (payload) => {
                        if (!payload || !payload.snapshot) return;
                        // Skip own snapshots
                        if (payload.player_id === playerId) return;
                        lastOpponentActivityTime = Date.now();
                        const state = GameStateSerializer.deserialize(payload.snapshot);
                        authoritativeState = state;
                        if (onOtherStateUpdate) onOtherStateUpdate(state);
                    }
                );
            }
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
        function updateRoomId(newRoomId, otherPlayerId) {
            // Clean old subscription before creating new one
            if (stateSub) {
                try {
                    const client = supabaseClient.getClient();
                    if (client && client.channel) {
                        try { client.channel(stateSub.id)?.unsubscribe?.(); } catch(e) {}
                    }
                } catch(e) {}
                stateSub = null;
            }
            roomId = newRoomId;
            console.log('[SyncEngine] 房間 ID 更新為:', roomId);

            // Re-subscribe to other player state with new room ID
            subscribeToOtherPlayer(otherPlayerId);
        }

        // ============ START / STOP ============
        function start() {
            isRunning = true;
            subscribeToOtherPlayer();
            subscribeToRoom();

            if (role === 'guest') {
                // Guest: rely on Realtime subscription for state updates.
                // No polling timer needed — the subscription pushes state changes immediately.
                
                // Heartbeat + opponent disconnection detection (every 5 seconds)
                heartbeatTimer = setInterval(() => {
                    if (!roomId || !supabaseClient.isConnectedState()) return;
                    supabaseClient.sendPlayerInput(roomId, playerId, 'heartbeat', lastVersion)
                        .then(() => {
                            consecutiveHeartbeatFailures = 0;
                        })
                        .catch(() => {
                            consecutiveHeartbeatFailures++;
                            if (consecutiveHeartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
                                console.warn('[SyncEngine] 連線中斷，對手可能已離線');
                                if (onOpponentDisconnected) onOpponentDisconnected();
                            }
                        });
                }, HEARTBEAT_INTERVAL_MS);
            } else if (role === 'host') {
                inputConsumeTimer = setInterval(() => {
                    if (!roomId || !supabaseClient.isConnectedState()) return;
                    consumeGuestInputs();
                }, INPUT_CONSUME_MS);

                // Host: monitor opponent activity via realtime updates
                // If no activity from opponent for 15+ seconds, they may be disconnected
                // (tracked via lastOpponentActivityTime updated in subscribeToOtherPlayer)
            }
        }

        function stop() {
            isRunning = false;

            if (inputTimer) { clearInterval(inputTimer); inputTimer = null; }
            if (statePollTimer) { clearInterval(statePollTimer); statePollTimer = null; }
            if (inputConsumeTimer) { clearInterval(inputConsumeTimer); inputConsumeTimer = null; }
            if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

            // Clear processed versions to prevent memory leak
            processedGuestVersions.length = 0;
            consecutiveHeartbeatFailures = 0;
            lastOpponentActivityTime = Date.now();

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

        // ============ CONSUME GUEST INPUTS (Host only) ============
        function consumeGuestInputs() {
            if (role !== 'host' || !roomId) return;

            const guestId = ownRoomData?.guest_id;
            if (!guestId) return;

            const result = supabaseClient.getPendingInputs(roomId, guestId);
            if (result.error) {
                console.warn('[SyncEngine] 讀取輸入失敗:', result.error);
                return;
            }

            for (const input of result.inputs) {
                // Deduplicate by input row ID (bounded array instead of unbounded Set)
                if (!processedGuestVersions.includes(input.id)) {
                    processedGuestVersions.push(input.id);
                    // Keep only recent records to prevent memory leak
                    if (processedGuestVersions.length > MAX_PROCESSED_RECORDS) {
                        processedGuestVersions = processedGuestVersions.slice(-MAX_PROCESSED_RECORDS);
                    }
                    if (onGameInput) {
                        onGameInput(input.input_type, input.room_id);
                    }
                }
            }
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
