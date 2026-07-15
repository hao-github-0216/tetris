/**
 * 多人模式遊戲控制器
 * 整合 GameCore, Renderer, GarbageSystem, SyncEngine, SupabaseClient
 */
const MultiplayerGameController = (() => {
    let mainRenderer = null;
    let syncEngine = null;
    let gameLoopId = null;
    let currentRoomData = null;
    let currentState = null;
    let gameStarted = false;
    let myRole = '';
    let myRoomCode = '';
    let myPlayerId = '';

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

    async function startGameLocally(role, roomCode, playerId, otherPlayerId) {
        gameStarted = false;
        myRole = role;
        myRoomCode = roomCode;
        myPlayerId = playerId;

        const SUPABASE_URL = document.body.dataset.supabaseUrl || '';
        const SUPABASE_ANON_KEY = document.body.dataset.supabaseAnonKey || '';

        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            try {
                await SupabaseClient.init(SUPABASE_URL, SUPABASE_ANON_KEY);
            } catch (e) {
                showMPError('無法連線至伺服器：' + e);
                return;
            }
        }

        const landingPageEl = document.getElementById('landing-page');
        const gamePageEl = document.getElementById('game-page');
        if (landingPageEl) landingPageEl.style.display = 'none';
        if (gamePageEl) gamePageEl.style.display = 'flex';

        mainRenderer = MultiplayerRenderer.create('mp-canvas', 'opponent-canvas', GameCore);

        syncEngine = SyncEngine.create({
            roomCode, roomId: null, playerId,
            otherPlayerId: otherPlayerId || null, supabaseClient: SupabaseClient
        });
        syncEngine.start();

        syncEngine.on(
            (state) => {
                if (state) {
                    const cleared = state._lastClearedCount || 0;
                    if (cleared > 0 && currentState && currentState.gameState === 'playing') {
                        applyGarbageFromCleared(currentState, cleared);
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
                if (myRole === 'host' && roomData && roomData.guest_id && currentRoomData && currentRoomData.guest_id === null) {
                    syncEngine.updateOtherPlayerId(roomData.guest_id);
                }
                _startGameIfReady(roomData);
            },
            () => {
                const el = document.getElementById('mp-message');
                if (el) { el.textContent = '對手的連線已中斷'; el.style.display = 'block'; }
            }
        );

        if (myRole === 'host') {
            createRoomAndStart(myRoomCode, myPlayerId);
        } else {
            joinExistingRoom(myRoomCode, myPlayerId);
        }
    }

    function _startGameIfReady(roomData) {
        if (!roomData || gameStarted) return;
        if (roomData.status !== 'playing' && !(myRole === 'host' && roomData.status === 'waiting')) return;

        gameStarted = true;
        if (roomData.id) syncEngine.updateRoomId(roomData.id);

        const state = GameCore.createEmptyState();
        state.gameState = 'playing';
        state.roomCode = myRoomCode;
        state.playerId = myPlayerId;
        state.role = myRole;
        GameCore.spawnPiece(state);
        startGameLoop(state);
    }

    async function createRoomAndStart(roomCode, hostId) {
        const result = await SupabaseClient.createRoom(roomCode, hostId);
        if (result.error) {
            console.error('[MultiplayerController] Create room error:', result.error);
            showMPError('創建房間失敗：' + result.error);
            return;
        }
        currentRoomData = result.room;
        syncEngine.updateRoomId(result.room.id);
        updateMatchUI(result.room, hostId, roomCode);
        const roomDisplay = document.getElementById('mp-room-display');
        if (roomDisplay) roomDisplay.textContent = roomCode;
        _startGameIfReady(result.room);
    }

    async function joinExistingRoom(roomCode, guestId) {
        const result = await SupabaseClient.joinRoom(roomCode, guestId);
        if (result.error) {
            console.error('[MultiplayerController] Join room error:', result.error);
            showMPError('加入房間失敗：' + result.error);
            return;
        }
        currentRoomData = result.room;
        syncEngine.updateRoomId(result.room.id);
        updateMatchUI(result.room, guestId, roomCode);
        syncEngine.updateOtherPlayerId(result.room.host_id);
        _startGameIfReady(result.room);
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
            roomCode, roomId: null, playerId, otherPlayerId: null, supabaseClient: SupabaseClient
        });
        syncEngine.start();

        syncEngine.on(
            (state) => {
                if (state) {
                    const cleared = state._lastClearedCount || 0;
                    if (cleared > 0 && currentState && currentState.gameState === 'playing') {
                        applyGarbageFromCleared(currentState, cleared);
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
                if (myRole === 'host' && roomData && roomData.guest_id && currentRoomData && currentRoomData.guest_id === null) {
                    syncEngine.updateOtherPlayerId(roomData.guest_id);
                }
                _startGameIfReady(roomData);
            },
            () => {
                const el = document.getElementById('mp-message');
                if (el) { el.textContent = '對手的連線已中斷'; el.style.display = 'block'; }
            }
        );

        setupMultiplayerControls();
    }

    // ============ GAME LOOP ============
    function startGameLoop(state) {
        currentState = state;

        function gameLoop(timestamp) {
            if (state.currentPiece && state.gameState === 'playing') {
                if (!state._lastDropTime) state._lastDropTime = timestamp;
                const dropInterval = GameCore.getDropInterval(state.level);
                const elapsed = timestamp - state._lastDropTime;
                if (elapsed >= dropInterval) {
                    handleAutoDrop(state);
                    state._lastDropTime = timestamp;
                }
            }

            const opponentSnapshot = syncEngine.getOtherState();
            mainRenderer.render(state, opponentSnapshot);

            gameLoopId = requestAnimationFrame(gameLoop);
        }

        gameLoopId = requestAnimationFrame(gameLoop);
    }

    // ============ INPUT HANDLING ============
    function setupMultiplayerControls() {
        const keyMap = {
            'ArrowLeft':  () => { const s = getCurrentState(); if (s && s.gameState === 'playing') GameCore.move(s, -1, 0); },
            'ArrowRight': () => { const s = getCurrentState(); if (s && s.gameState === 'playing') GameCore.move(s, 1, 0); },
            'ArrowDown':  () => { const s = getCurrentState(); if (s && s.gameState === 'playing') GameCore.dropPiece(s); },
            'ArrowUp':    () => { const s = getCurrentState(); if (s && s.gameState === 'playing') GameCore.tryRotate(s); },
            ' ':          () => { const s = getCurrentState(); if (s && s.gameState === 'playing') GameCore.commitHardDrop(s); },
            'x': () => { const s = getCurrentState(); if (s && s.gameState === 'playing' && !s.hasHeld) GameCore.holdPiece(s); },
            'Escape': () => { showLanding(); }
        };

        const backBtn = document.getElementById('mp-back-btn');
        if (backBtn) backBtn.addEventListener('click', () => showLanding());

        setupTouchControls(keyMap);

        document.addEventListener('keydown', (e) => {
            const handler = keyMap[e.key];
            if (handler) { e.preventDefault(); handler(); }
        });
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
    try {
        const { roomCode, playerId } = RoomSystem.createLocalRoom();
        MultiplayerGameController.startGameLocally('host', roomCode, playerId);
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
