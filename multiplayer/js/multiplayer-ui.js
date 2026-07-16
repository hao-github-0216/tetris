/**
 * 多人模式遊戲控制器（Server-Authoritative）
 * Host 維護單一真實狀態，Guest 發送輸入到 Host
 */
const MultiplayerGameController = (() => {
    let mainRenderer = null;
    let syncEngine = null;
    let gameLoopId = null;
    let keydownHandler = null;
    let currentRoomData = null;
    let currentState = null;
    let gameStarted = false;
    let myRole = '';
    let myRoomCode = '';
    let myPlayerId = '';
    let opponentState = null;

    // ============ GARBAGE APPLICATION (multiplayer-only) ============
    function applyGarbageFromCleared(state, clearedCount) {
        if (!clearedCount || clearedCount <= 0 || !state || state.gameState !== 'playing') return;

        const COLS = GameCore.COLS;
        const EMPTY = GameCore.EMPTY;
        const numGarbage = { 1: 0, 2: 1, 3: 2, 4: 4 }[clearedCount] || 0;
        if (numGarbage === 0) return;

        const garbageColors = ['#888888', '#777777', '#666666', '#555555'];
        for (let g = 0; g < numGarbage; g++) {
            const row = Array(COLS).fill(EMPTY);
            const hole = Math.floor(Math.random() * COLS);
            const color = garbageColors[Math.floor(Math.random() * garbageColors.length)];
            for (let x = 0; x < COLS; x++) {
                if (x !== hole) row[x] = color;
            }
            state.board.splice(0, 0, row);
            state.board.pop();
        }
    }

    // ============ INITIALIZATION ============
    async function init(landingPage) {
        if (landingPage) {
            setupLandingUI();
            return;
        }
        await setupGameUI();
    }

    async function startGameLocally(role, roomCode, playerId) {
        console.log('[Multiplayer] startGameLocally:', { role, roomCode, playerId });
        gameStarted = false;
        myRole = role;
        myRoomCode = roomCode;
        myPlayerId = playerId;

        const SUPABASE_URL = document.body.dataset.supabaseUrl || '';
        const SUPABASE_ANON_KEY = document.body.dataset.supabaseAnonKey || '';
        console.log('[Multiplayer] Supabase URL present:', !!SUPABASE_URL);

        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            try {
                await SupabaseClient.init(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.log('[Multiplayer] Supabase init complete');
            } catch (e) {
                console.error('[Multiplayer] Supabase init failed:', e);
                showMPError('無法連線至伺服器：' + e);
                return;
            }
        }

        console.log('[Multiplayer] Showing game page, hiding landing');
        const landingPageEl = document.getElementById('landing-page');
        const gamePageEl = document.getElementById('game-page');
        if (landingPageEl) landingPageEl.style.display = 'none';
        if (gamePageEl) gamePageEl.style.display = 'flex';

        // Immediately show the room code so user can share it
        const roomDisplay = document.getElementById('mp-room-display');
        console.log('[Multiplayer] Room display element found:', roomDisplay !== null);
        console.log('[Multiplayer] Setting room code:', myRoomCode);
        if (roomDisplay) {
            roomDisplay.textContent = myRoomCode;
            console.log('[Multiplayer] Room code set successfully');
        } else {
            console.error('[Multiplayer] ERROR: roomDisplay element not found!');
        }

        mainRenderer = MultiplayerRenderer.create('mp-canvas', 'opponent-canvas', GameCore);
        console.log('[Multiplayer] Renderer created');

        syncEngine = SyncEngine.create({
            roomCode, roomId: null, playerId, role, supabaseClient: SupabaseClient
        });
        syncEngine.start();
        console.log('[Multiplayer] SyncEngine started');

        syncEngine.on(
            (state) => {
                if (state) {
                    // Apply authoritative state to our own state for rendering
                    if (myRole === 'guest') {
                        // Guest: Host's state IS our state — apply directly
                        const newState = GameCore.deserialize(GameCore.serialize(state));
                        if (!currentState) {
                            currentState = newState;
                        } else {
                            // Deep merge: keep own metadata, overwrite game data
                            currentState.board = newState.board;
                            currentState.currentPiece = newState.currentPiece;
                            currentState.nextPieceType = newState.nextPieceType;
                            currentState.score = newState.score;
                            currentState.level = newState.level;
                            currentState.linesCleared = newState.linesCleared;
                            currentState.bag = newState.bag;
                            currentState.heldPiece = newState.heldPiece;
                            currentState.hasHeld = newState.hasHeld;
                            currentState.gameState = newState.gameState;
                            currentState._lastClearedCount = newState._lastClearedCount;
                            currentState._comboCount = newState._comboCount;
                        }
                    } else {
                        // Host: track opponent state separately
                        opponentState = state;
                        const cleared = state._lastClearedCount || 0;
                        if (cleared > 0 && currentState && currentState.gameState === 'playing') {
                            applyGarbageFromCleared(currentState, cleared);
                        }
                    }
                    const scoreEl = document.getElementById('mp-other-score');
                    const levelEl = document.getElementById('mp-other-level');
                    if (scoreEl) scoreEl.textContent = (state.score || 0).toString();
                    if (levelEl) levelEl.textContent = (state.level || 1);
                }
            },
            (roomData) => {
                currentRoomData = roomData;
                updateMatchUI(roomData, playerId, roomCode);
                if (myRole === 'host' && roomData && roomData.guest_id) {
                    console.log('[Multiplayer] Host detected guest:', roomData.guest_id);
                }
            },
            () => {
                const el = document.getElementById('mp-message');
                if (el) { el.textContent = '對手的連線已中斷'; el.style.display = 'block'; }
            },
            (inputType) => {
                if (myRole === 'host' && currentState && currentState.gameState === 'playing' && currentState.currentPiece) {
                    console.log('[Multiplayer] Host applying guest input:', inputType);
                    applyInput(inputType);
                }
            }
        );

        if (myRole === 'host') {
            createRoomAndStart(myRoomCode, myPlayerId);
        } else {
            joinExistingRoom(myRoomCode, myPlayerId);
        }
    }

    async function createRoomAndStart(roomCode, hostId) {
        console.log('[Multiplayer] createRoomAndStart called:', { roomCode, hostId });
        // Room display is already set in startGameLocally
        const result = await SupabaseClient.createRoom(roomCode, hostId);
        console.log('[Multiplayer] createRoom result:', { error: result.error, room: result.room });
        if (result.error) {
            console.error('[Multiplayer] Create room error:', result.error);
            showMPError('創建房間失敗：' + result.error);
            return;
        }
        currentRoomData = result.room;
        syncEngine.updateRoomId(result.room.id);
        updateMatchUI(result.room, hostId, roomCode);
        
        // Host starts game immediately after creating room
        console.log('[Multiplayer] Host starting game loop after room creation');
        startHostGame(result.room);
        
        // Immediately broadcast initial state so Guests don't wait for first auto-drop
        setTimeout(() => {
            if (syncEngine && currentState) {
                syncEngine.broadcastMyState(currentState);
                console.log('[Multiplayer] Host initial state broadcast sent');
            }
        }, 100);
    }

    async function joinExistingRoom(roomCode, guestId) {
        console.log('[Multiplayer] joinExistingRoom called:', { roomCode, guestId });
        const result = await SupabaseClient.joinRoom(roomCode, guestId);
        console.log('[Multiplayer] joinRoom result:', { error: result.error, room: result.room });
        if (result.error) {
            console.error('[Multiplayer] Join room error:', result.error);
            showMPError('加入房間失敗：' + result.error);
            return;
        }
        currentRoomData = result.room;
        syncEngine.updateRoomId(result.room.id);
        updateMatchUI(result.room, guestId, roomCode);
        
        // Immediately fetch the host's current state to avoid waiting for first poll
        console.log('[Multiplayer] Fetching initial host state...');
        try {
            const latestStateResult = await SupabaseClient.getLatestState(result.room.id);
            if (latestStateResult.state && latestStateResult.state.player_id !== myPlayerId) {
                const initialState = GameCore.deserialize(latestStateResult.state.snapshot);
                if (currentState) {
                    currentState.board = initialState.board;
                    currentState.currentPiece = initialState.currentPiece;
                    currentState.nextPieceType = initialState.nextPieceType;
                    currentState.score = initialState.score;
                    currentState.level = initialState.level;
                    currentState.linesCleared = initialState.linesCleared;
                    currentState.bag = initialState.bag;
                    currentState.heldPiece = initialState.heldPiece;
                    currentState.hasHeld = initialState.hasHeld;
                    currentState.gameState = initialState.gameState;
                    currentState._lastClearedCount = initialState._lastClearedCount;
                    currentState._comboCount = initialState._comboCount;
                    console.log('[Multiplayer] Initial state fetched, board rows:', initialState.board.length);
                }
            }
        } catch (e) {
            console.warn('[Multiplayer] Failed to fetch initial state:', e);
        }
        
        // Guest: start a lightweight game loop to render Host's authoritative state
        console.log('[Multiplayer] Guest starting render loop');
        startGuestRenderLoop(result.room);
    }

    function startGuestRenderLoop(roomData) {
        console.log('[Multiplayer] ✅ Starting guest render loop in room', roomData.id);
        gameStarted = true;

        // Create empty state for rendering
        const state = GameCore.createEmptyState();
        state.gameState = 'playing';
        state.roomCode = myRoomCode;
        state.playerId = myPlayerId;
        state.role = myRole;
        
        // Spawn a piece so the guest's board renders content immediately
        GameCore.spawnPiece(state);
        
        currentState = state;

        startGameLoop(state);
    }

    function startHostGame(roomData) {
        console.log('[Multiplayer] ✅ Starting game for host in room', roomData.id);
        gameStarted = true;

        const state = GameCore.createEmptyState();
        state.gameState = 'playing';
        state.roomCode = myRoomCode;
        state.playerId = myPlayerId;
        state.role = myRole;
        GameCore.spawnPiece(state);
        startGameLoop(state);
    }

    function getMyRoomCode() { return myRoomCode; }
    function getMyPlayerId() { return myPlayerId; }

    // ============ GAME UI SETUP (direct URL navigation path) ============
    async function setupGameUI() {
        gameStarted = false;

        const SUPABASE_URL = document.body.dataset.supabaseUrl || '';
        const SUPABASE_ANON_KEY = document.body.dataset.supabaseAnonKey || '';

        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            try { await SupabaseClient.init(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { showMPError('無法連線至伺服器：' + e); return; }
        }

        const { roomCode, playerId, role } = getURLParams();
        if (!roomCode || !playerId) {
            showLanding();
            return;
        }

        myRole = role;
        myRoomCode = roomCode;
        myPlayerId = playerId;

        mainRenderer = MultiplayerRenderer.create('mp-canvas', 'opponent-canvas', GameCore);

        syncEngine = SyncEngine.create({
            roomCode, roomId: null, playerId, role, supabaseClient: SupabaseClient
        });
        syncEngine.start();

        syncEngine.on(
            (state) => {
                if (state) {
                    // Apply authoritative state to our own state for rendering
                    if (myRole === 'guest') {
                        // Guest: Host's state IS our state — apply directly
                        const newState = GameCore.deserialize(GameCore.serialize(state));
                        if (!currentState) {
                            currentState = newState;
                        } else {
                            // Deep merge: keep own metadata, overwrite game data
                            currentState.board = newState.board;
                            currentState.currentPiece = newState.currentPiece;
                            currentState.nextPieceType = newState.nextPieceType;
                            currentState.score = newState.score;
                            currentState.level = newState.level;
                            currentState.linesCleared = newState.linesCleared;
                            currentState.bag = newState.bag;
                            currentState.heldPiece = newState.heldPiece;
                            currentState.hasHeld = newState.hasHeld;
                            currentState.gameState = newState.gameState;
                            currentState._lastClearedCount = newState._lastClearedCount;
                            currentState._comboCount = newState._comboCount;
                        }
                    } else {
                        // Host: track opponent state separately
                        opponentState = state;
                        const cleared = state._lastClearedCount || 0;
                        if (cleared > 0 && currentState && currentState.gameState === 'playing') {
                            applyGarbageFromCleared(currentState, cleared);
                        }
                    }
                    const scoreEl = document.getElementById('mp-other-score');
                    const levelEl = document.getElementById('mp-other-level');
                    if (scoreEl) scoreEl.textContent = (state.score || 0).toString();
                    if (levelEl) levelEl.textContent = (state.level || 1);
                }
            },
            (roomData) => {
                currentRoomData = roomData;
                updateMatchUI(roomData, playerId, roomCode);
                if (myRole === 'host' && roomData && roomData.guest_id) {
                    console.log('[Multiplayer] setupGameUI: Host detected guest:', roomData.guest_id);
                }
            },
            () => {
                const el = document.getElementById('mp-message');
                if (el) { el.textContent = '對手的連線已中斷'; el.style.display = 'block'; }
            },
            (inputType) => {
                if (myRole === 'host' && currentState && currentState.gameState === 'playing' && currentState.currentPiece) {
                    console.log('[Multiplayer] setupGameUI: Host applying guest input:', inputType);
                    applyInput(inputType);
                }
            }
        );

        // Host: create room and start; Guest: join existing room and subscribe to host
        if (myRole === 'host') {
            await createRoomAndStart(roomCode, playerId);
        } else {
            await joinExistingRoom(roomCode, playerId);
        }

        // Immediately fetch the host's current state for direct URL navigation path
        console.log('[Multiplayer] Fetching initial host state for direct navigation...');
        try {
            const latestStateResult = await SupabaseClient.getLatestState(currentRoomData.id);
            if (latestStateResult.state && latestStateResult.state.player_id !== myPlayerId) {
                const initialState = GameCore.deserialize(latestStateResult.state.snapshot);
                if (currentState) {
                    currentState.board = initialState.board;
                    currentState.currentPiece = initialState.currentPiece;
                    currentState.nextPieceType = initialState.nextPieceType;
                    currentState.score = initialState.score;
                    currentState.level = initialState.level;
                    currentState.linesCleared = initialState.linesCleared;
                    currentState.bag = initialState.bag;
                    currentState.heldPiece = initialState.heldPiece;
                    currentState.hasHeld = initialState.hasHeld;
                    currentState.gameState = initialState.gameState;
                    currentState._lastClearedCount = initialState._lastClearedCount;
                    currentState._comboCount = initialState._comboCount;
                    console.log('[Multiplayer] Initial state fetched via direct nav, board rows:', initialState.board.length);
                }
            }
        } catch (e) {
            console.warn('[Multiplayer] Failed to fetch initial state for direct nav:', e);
        }

        setupMultiplayerControls();
    }

    // ============ GAME LOOP ============
    function startGameLoop(state) {
        currentState = state;

        function gameLoop(timestamp) {
            try {
                // Only Host drives game simulation. Guest is render-only.
                if (myRole === 'host' && state.currentPiece && state.gameState === 'playing') {
                    if (!state._lastDropTime) state._lastDropTime = timestamp;
                    const dropInterval = GameCore.getDropInterval(state.level);
                    const elapsed = timestamp - state._lastDropTime;
                    if (elapsed >= dropInterval) {
                        handleAutoDrop(state);
                        state._lastDropTime = timestamp;
                    }
                }

                const opponentSnapshot = syncEngine.getAuthoritativeState();
                mainRenderer.render(state, opponentSnapshot);
            } catch (e) {
                console.error('[Multiplayer] Game loop error:', e);
                stopGameLoop();
                showMPMessage('遊戲循環錯誤：' + e.message);
                return;
            }

            gameLoopId = requestAnimationFrame(gameLoop);
        }

        gameLoopId = requestAnimationFrame(gameLoop);
    }

    // ============ INPUT HANDLING ============
    function setupMultiplayerControls() {
        // Remove previous handler if exists
        if (keydownHandler) {
            document.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }

        const keyMap = {
            'ArrowLeft':  () => { sendInput('left'); },
            'ArrowRight': () => { sendInput('right'); },
            'ArrowDown':  () => { sendInput('down'); },
            'ArrowUp':    () => { sendInput('rotate'); },
            ' ':          () => { sendInput('hard_drop'); },
            'x': () => { sendInput('hold'); },
            'Escape': () => { showLanding(); }
        };

        keydownHandler = (e) => {
            const handler = keyMap[e.key];
            if (handler) { e.preventDefault(); handler(); }
        };
        document.addEventListener('keydown', keydownHandler);

        const backBtn = document.getElementById('mp-back-btn');
        if (backBtn) backBtn.addEventListener('click', () => showLanding());

        setupTouchControls(keyMap);
    }

    function sendInput(inputType) {
        if (!syncEngine || !currentState || currentState.gameState !== 'playing') return;
        syncEngine.sendInput(inputType);
    }

    function applyInput(inputType) {
        if (!currentState || currentState.gameState !== 'playing' || !currentState.currentPiece) return;
        
        // Ignore heartbeat inputs — they're just for connection monitoring
        if (inputType === 'heartbeat') return;

        switch (inputType) {
            case 'left': GameCore.move(currentState, -1, 0); break;
            case 'right': GameCore.move(currentState, 1, 0); break;
            case 'down': GameCore.dropPiece(currentState); break;
            case 'rotate': GameCore.tryRotate(currentState); break;
            case 'hard_drop':
                GameCore.hardDrop(currentState);
                const info = GameCore.commitHardDrop(currentState);
                if (info.clearedCount > 0) {
                    // Broadcast immediately so guest sees the clear
                    syncEngine.broadcastMyState(currentState);
                }
                break;
            case 'hold':
                GameCore.holdPiece(currentState);
                // Broadcast handled below
                break;
        }
        // Broadcast final state after all input handling
        syncEngine.broadcastMyState(currentState);
    }

    function setupTouchControls(keyMap) {
        const btns = {
            'mp-btn-left': 'ArrowLeft',
            'mp-btn-right': 'ArrowRight',
            'mp-btn-down': 'ArrowDown',
            'mp-btn-rotate': 'ArrowUp',
            'mp-btn-drop': ' ',
            'mp-btn-hold': 'x'
        };
        for (const [id, key] of Object.entries(btns)) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', () => keyMap[key]?.());
        }
    }

    function getCurrentState() { return currentState; }

    function handleAutoDrop(state) {
        if (!state.currentPiece || state.gameState !== 'playing') return;
        GameCore.dropPiece(state);
        syncEngine.broadcastMyState(state);
        if (state.gameState === 'gameover') finishGame(state);
    }

    function finishGame(state) {
        state.gameState = 'gameover';
        stopGameLoop();
        if (currentRoomData && currentRoomData.id && SupabaseClient.isConnectedState()) {
            SupabaseClient.finishRoom(currentRoomData.id, 'finished').catch(() => {});
        }
        setTimeout(() => showLanding(), 1500);
    }

    // ============ UI UPDATES ============
    function updateMatchUI(roomData, playerId, roomCode) {
        const statusEl = document.getElementById('mp-connection-status');
        if (!statusEl) return;

        if (roomData?.status === 'waiting') {
            statusEl.textContent = '等待對手加入...';
            statusEl.style.color = '#f5c542';
        } else if (roomData?.status === 'playing') {
            statusEl.textContent = '對局進行中';
            statusEl.style.color = '#00ff87';
        } else {
            statusEl.textContent = '已結束';
            statusEl.style.color = '#ff4757';
        }

        const roomDisplay = document.getElementById('mp-room-display');
        if (roomDisplay) roomDisplay.textContent = roomCode;
    }

    function showMPError(message) {
        const el = document.getElementById('mp-error');
        if (el) { el.textContent = message; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; }, 3000); }
    }

    function showMPMessage(message) {
        const el = document.getElementById('mp-message');
        if (el) { el.textContent = message; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; }, 3000); }
    }

    // ============ NAVIGATION ============
    function showLanding() {
        stopGameLoop();
        const landingPageEl = document.getElementById('landing-page');
        const gamePageEl = document.getElementById('game-page');
        if (landingPageEl) landingPageEl.style.display = 'flex';
        if (gamePageEl) gamePageEl.style.display = 'none';
        const joinForm = document.getElementById('join-form-inline');
        if (joinForm) joinForm.classList.remove('active');
    }

    function getURLParams() {
        const params = new URLSearchParams(window.location.search);
        return { roomCode: params.get('roomCode'), playerId: params.get('playerId'), role: params.get('role') || 'host' };
    }

    function stopGameLoop() {
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
        if (syncEngine) { syncEngine.stop(); syncEngine = null; }
    }

    return { init, startGameLocally };
})();

// ============ GLOBAL HANDLERS FOR HTML onclick ============
window._mpHandleCreateRoom = function() {
    console.log('[Global] Creating room...');
    try {
        const { roomCode, playerId } = RoomSystem.createLocalRoom();
        console.log('[Global] Room created:', { roomCode, playerId });
        MultiplayerGameController.startGameLocally('host', roomCode, playerId);
        console.log('[Global] startGameLocally called');
    } catch (e) {
        console.error('[Global] Error creating room:', e);
        alert('創建房間失敗：' + e.message);
    }
};

window._mpHandleJoinRoom = function() {
    try {
        const input = document.getElementById('mp-room-code-input');
        const roomCode = input ? input.value.trim().toUpperCase() : '';
        if (!roomCode) { alert('請輸入房間碼'); return; }
        if (!RoomSystem.validateRoomCode(roomCode)) { alert('請輸入有效的房間碼'); return; }
        const playerId = RoomSystem.generatePlayerId();
        MultiplayerGameController.startGameLocally('guest', roomCode, playerId);
    } catch (e) {
        console.error('[Global] Error joining room:', e);
        alert('加入房間失敗：' + e.message);
    }
};
