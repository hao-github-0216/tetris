/**
 * 多人模式遊戲控制器
 * 整合 GameCore, Renderer, GarbageSystem, SyncEngine, SupabaseClient
 */
const MultiplayerGameController = (() => {
    let mainRenderer = null;
    let syncEngine = null;
    let gameLoopId = null;
    let currentRoomData = null;
    let currentState = null;  // In-memory game state
    let gameStarted = false;  // Flag to prevent double-start

    // ============ GARBAGE APPLICATION (multiplayer-only) ============
    function applyGarbageFromCleared(state, clearedCount) {
        if (!clearedCount || clearedCount <= 0 || !state || state.gameState !== 'playing') return;

        const COLS = GameCore.COLS;
        const ROWS = GameCore.ROWS;

        // Standard Tetris garbage rules: 2 cleared -> 1 garbage, 3 -> 2, 4 -> 4
        const garbageRows = {
            1: 0,
            2: 1,
            3: 2,
            4: 4
        };
        const numGarbage = garbageRows[clearedCount] || 0;

        if (numGarbage === 0) return;

        const EMPTY = GameCore.EMPTY;
        const PIECES = GameCore.PIECES;
        const garbageColors = ['#888888', '#777777', '#666666', '#555555'];

        // Add garbage rows at the bottom
        for (let g = 0; g < numGarbage; g++) {
            const row = Array(COLS).fill(EMPTY);
            // Place one hole at a random position
            const hole = Math.floor(Math.random() * COLS);
            const color = garbageColors[Math.floor(Math.random() * garbageColors.length)];
            for (let x = 0; x < COLS; x++) {
                if (x !== hole) {
                    row[x] = color;
                }
            }
            state.board.splice(0, 0, row); // push to top
            state.board.pop(); // remove bottom
        }
    }

    // ============ INITIALIZATION ============
    function init(landingPage) {
        if (landingPage) {
            setupLandingUI();
            return;
        }
        setupGameUI();
    }

    // ============ LANDING / LOBBY UI ============
    function setupLandingUI() {
        const createBtn = document.getElementById('mp-create-room');
        const joinBtn = document.getElementById('mp-join-btn');
        const roomCodeInput = document.getElementById('mp-room-code-input');

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                const { roomCode, playerId } = RoomSystem.createLocalRoom();
                navigateFromLanding('host', roomCode, playerId);
            });
        }

        if (joinBtn && roomCodeInput) {
            joinBtn.addEventListener('click', () => {
                const roomCode = roomCodeInput.value.trim().toUpperCase();
                if (!RoomSystem.validateRoomCode(roomCode)) {
                    showMPError('請輸入有效的房間碼');
                    return;
                }
                const { playerId } = RoomSystem.joinLocalRoom(roomCode);
                navigateToGamePage('guest', roomCode, playerId, null);
            });
        }
    }

    // ============ GAME UI SETUP ============
    function setupGameUI() {
        // Reset game state for fresh start
        gameStarted = false;

        // Initialize Supabase (async — SDK loads from CDN)
        const SUPABASE_URL = document.body.dataset.supabaseUrl || '';
        const SUPABASE_ANON_KEY = document.body.dataset.supabaseAnonKey || '';

        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            SupabaseClient.init(SUPABASE_URL, SUPABASE_ANON_KEY);
        } else {
            console.log('[MultiplayerController] 未配置 Supabase，使用離線模式');
        }

        const { roomCode, playerId, role } = getURLParams();
        if (!roomCode || !playerId) {
            navigateToLanding();
            return;
        }

        // Create renderer (displays main board + opponent mini-board)
        mainRenderer = MultiplayerRenderer.create('mp-canvas', 'opponent-canvas', GameCore);

        // Set up sync engine (room ID will be set when room is created/joined)
        syncEngine = SyncEngine.create({
            roomCode: roomCode,
            roomId: null,
            playerId: playerId,
            otherPlayerId: null,  // Will be set from room data
            supabaseClient: SupabaseClient
        });

        // Start sync engine (subscribes to realtime listeners)
        syncEngine.start();

        const myRole = role;

        // Callback: when room data changes in Supabase (e.g., guest joins host's room)
        syncEngine.on(
            (state) => {
                // When we receive the opponent's state:
                // 1. Apply garbage rows to our board based on their cleared lines
                // 2. Update opponent info displays
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
                updateOpponentInfoDisplay(roomData, myRole);

                // Host: when guest_id becomes available (guest joins), subscribe to guest's state
                if (myRole === 'host' && roomData && roomData.guest_id && currentRoomData && currentRoomData.guest_id === null) {
                    syncEngine.updateOtherPlayerId(roomData.guest_id);
                }

                // When room transitions to 'playing', start the game (once)
                if (roomData && roomData.status === 'playing' && !gameStarted) {
                    gameStarted = true;
                    if (roomData.id) {
                        syncEngine.updateRoomId(roomData.id);
                    }
                    // Start game loop for this player
                    const state = GameCore.createEmptyState();
                    state.gameState = 'playing';
                    state.roomCode = roomCode;
                    state.playerId = playerId;
                    state.role = myRole;
                    GameCore.spawnPiece(state);
                    startGameLoop(state);
                }
            },
            () => {
                showMPMessage('對手的連線已中斷');
            }
        );

        // Initialize game (creates room or joins room)
        initGame(roomCode, playerId, role);

        // Keyboard controls
        setupMultiplayerControls();
    }

    // ============ GAME INITIALIZATION ============
    function initGame(roomCode, playerId, role) {
        // Guest: look up and join the room
        if (role === 'guest') {
            SupabaseClient.getRoom(roomCode)
                .then(({ error, room }) => {
                    if (error || !room) {
                        showMPError('找不到此房間或房間已不存在');
                        setTimeout(() => navigateToLanding(), 2000);
                        return;
                    }
                    // Join the room (updates guest_id and status to 'playing')
                    SupabaseClient.joinRoom(roomCode, playerId)
                        .then(({ error: joinError, room: joinedRoom }) => {
                            if (joinError) {
                                showMPError('無法加入房間：' + joinError);
                                setTimeout(() => navigateToLanding(), 2000);
                                return;
                            }
                            currentRoomData = joinedRoom;
                            if (joinedRoom.id) {
                                syncEngine.updateRoomId(joinedRoom.id);
                            }
                            // Set otherPlayerId for subscription
                            syncEngine.updateOtherPlayerId(joinedRoom.host_id);
                        });
                });
        }
        // Host: create room in Supabase
        if (role === 'host') {
            SupabaseClient.createRoom(roomCode, playerId)
                .then(({ error, room }) => {
                    if (!error && room) {
                        currentRoomData = room;
                        if (room.id) {
                            syncEngine.updateRoomId(room.id);
                        }
                    }
                });
        }
    }

    // ============ GAME LOOP ============
    function startGameLoop(state) {
        currentState = state;

        function gameLoop(timestamp) {
            // Auto-drop (gravity)
            if (state.currentPiece && state.gameState === 'playing') {
                if (!state._lastDropTime) state._lastDropTime = timestamp;
                const dropInterval = GameCore.getDropInterval(state.level);
                const elapsed = timestamp - state._lastDropTime;
                if (elapsed >= dropInterval) {
                    handleAutoDrop(state);
                    state._lastDropTime = timestamp;
                }
            }

            // Render: own board + opponent's mini board
            const opponentSnapshot = syncEngine.getOtherState();
            mainRenderer.render(state, opponentSnapshot);

            gameLoopId = requestAnimationFrame(gameLoop);
        }

        gameLoopId = requestAnimationFrame(gameLoop);
    }

    // ============ INPUT HANDLING ============
    function setupMultiplayerControls() {
        // Keyboard mapping
        const keyMap = {
            'ArrowLeft':  () => { const s = getCurrentState(); if (s && s.gameState === 'playing') GameCore.move(s, -1, 0); },
            'ArrowRight': () => { const s = getCurrentState(); if (s && s.gameState === 'playing') GameCore.move(s, 1, 0); },
            'ArrowDown':  () => { const s = getCurrentState(); if (s && s.gameState === 'playing') GameCore.dropPiece(s); },
            'ArrowUp':    () => { const s = getCurrentState(); if (s && s.gameState === 'playing') GameCore.tryRotate(s); },
            ' ':          () => {
                const s = getCurrentState();
                if (s && s.gameState === 'playing') {
                    GameCore.commitHardDrop(s);
                }
            },
            'x': () => { const s = getCurrentState(); if (s && s.gameState === 'playing' && !s.hasHeld) GameCore.holdPiece(s); },
            'X': () => { const s = getCurrentState(); if (s && s.gameState === 'playing' && !s.hasHeld) GameCore.holdPiece(s); },
            'Escape': () => { showLanding(); }
        };

        // Touch controls
        setupTouchControls(keyMap);

        // Keyboard event listener
        document.addEventListener('keydown', (e) => {
            const handler = keyMap[e.key];
            if (handler) {
                e.preventDefault();
                handler();
            }
        });
    }

    function setupTouchControls(keyMap) {
        const leftBtn = document.getElementById('mp-btn-left');
        const rightBtn = document.getElementById('mp-btn-right');
        const downBtn = document.getElementById('mp-btn-down');
        const rotateBtn = document.getElementById('mp-btn-rotate');
        const dropBtn = document.getElementById('mp-btn-drop');
        const holdBtn = document.getElementById('mp-btn-hold');

        if (leftBtn) leftBtn.addEventListener('click', () => keyMap['ArrowLeft']());
        if (rightBtn) rightBtn.addEventListener('click', () => keyMap['ArrowRight']());
        if (downBtn) downBtn.addEventListener('click', () => keyMap['ArrowDown']());
        if (rotateBtn) rotateBtn.addEventListener('click', () => keyMap['ArrowUp']());
        if (dropBtn) dropBtn.addEventListener('click', () => keyMap[' ']());
        if (holdBtn) holdBtn.addEventListener('click', () => keyMap['x']());
    }

    // ============ GAME LOGIC ============
    function getCurrentState() {
        return currentState;
    }

    function handleAutoDrop(state) {
        if (!state.currentPiece || state.gameState !== 'playing') return;

        // Drop the piece (moves down 1 row, locks if can't, clears lines)
        GameCore.dropPiece(state);

        // Broadcast state to Supabase (includes _lastClearedCount for garbage calculation)
        syncEngine.broadcastMyState(state);

        // Check game over (lockPiece can trigger gameover if board is full)
        if (state.gameState === 'gameover') {
            finishGame(state);
        }
    }

    function finishGame(state) {
        state.gameState = 'gameover';
        stopGameLoop();

        // Update room status in Supabase (best effort — may fail if disconnected)
        if (currentRoomData && currentRoomData.id && SupabaseClient.isConnectedState()) {
            SupabaseClient.finishRoom(currentRoomData.id, 'finished').catch(() => {});
        }

        // Return to landing after a brief pause
        setTimeout(() => showLanding(), 1500);
    }

    // ============ UI UPDATES ============
    function updateMatchUI(roomData, playerId, roomCode) {
        const statusEl = document.getElementById('mp-connection-status');
        if (!statusEl) return;

        if (roomData && roomData.status === 'waiting') {
            statusEl.textContent = '等待對手加入...';
            statusEl.style.color = '#f5c542';
        } else if (roomData && roomData.status === 'playing') {
            statusEl.textContent = '對局進行中';
            statusEl.style.color = '#00ff87';
        } else {
            statusEl.textContent = '已結束';
            statusEl.style.color = '#ff4757';
        }

        // Update room code display
        const roomDisplay = document.getElementById('mp-room-display');
        if (roomDisplay) {
            roomDisplay.textContent = roomCode;
        }
    }

    function updateOpponentInfoDisplay(roomData, myRole) {
        // Could display opponent name here if stored
        const opponentId = myRole === 'host' ? (roomData ? roomData.guest_id : null) : (roomData ? roomData.host_id : null);
        // Future: look up opponent name by ID
    }

    function showMPError(message) {
        const el = document.getElementById('mp-error');
        if (el) {
            el.textContent = message;
            el.style.display = 'block';
            setTimeout(() => { el.style.display = 'none'; }, 3000);
        }
    }

    function showMPMessage(message) {
        const el = document.getElementById('mp-message');
        if (el) {
            el.textContent = message;
            el.style.display = 'block';
            setTimeout(() => { el.style.display = 'none'; }, 3000);
        }
    }

    // ============ NAVIGATION ============
    function navigateToLanding() {
        window.location.href = '../index.html';
    }

    function navigateToGamePage(role, roomCode, playerId, otherPlayerId) {
        const url = new URL('multiplayer/index.html', window.location.origin);
        url.searchParams.set('roomCode', roomCode);
        url.searchParams.set('playerId', playerId);
        url.searchParams.set('role', role);
        if (otherPlayerId) {
            url.searchParams.set('otherPlayerId', otherPlayerId);
        }
        window.location.href = url.toString();
    }

    // Redirect landing page create/join to multiplayer game
    function navigateFromLanding(role, roomCode, playerId, otherPlayerId) {
        window.location.href = `multiplayer/index.html?roomCode=${encodeURIComponent(roomCode)}&playerId=${encodeURIComponent(playerId)}&role=${role}`;
        if (otherPlayerId) {
            window.location.href += `&otherPlayerId=${encodeURIComponent(otherPlayerId)}`;
        }
    }

    function navigateToGamePage(role, roomCode, playerId, otherPlayerId) {
        const url = new URL('index.html', window.location.origin);
        url.searchParams.set('roomCode', roomCode);
        url.searchParams.set('playerId', playerId);
        url.searchParams.set('role', role);
        if (otherPlayerId) {
            url.searchParams.set('otherPlayerId', otherPlayerId);
        }
        window.location.href = url.toString();
    }

    function showLanding() {
        stopGameLoop();
        navigateToLanding();
    }

    function getURLParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            roomCode: params.get('roomCode'),
            playerId: params.get('playerId'),
            role: params.get('role') || 'host'
        };
    }

    function stopGameLoop() {
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
        if (syncEngine) {
            syncEngine.stop();
            syncEngine = null;
        }
    }

    return { init };
})();
