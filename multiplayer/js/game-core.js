/**
 * 俄羅斯方塊純遊戲核心 — 不依賴 DOM / Canvas
 * 提供遊戲狀態、方塊管理、消行等核心邏輯
 * 可被單人模式或多人模式共用
 */
const GameCore = (() => {
    const COLS = 10;
    const ROWS = 20;
    const EMPTY = 0;

    // Piece definitions
    const PIECES = {
        I: {
            shape: [
                [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
                [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
                [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
                [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
            ],
            color: '#00f5ff'
        },
        O: {
            shape: [
                [[1,1],[1,1]],
                [[1,1],[1,1]],
                [[1,1],[1,1]],
                [[1,1],[1,1]]
            ],
            color: '#ffff00'
        },
        T: {
            shape: [
                [[0,1,0],[1,1,1],[0,0,0]],
                [[0,1,0],[0,1,1],[0,1,0]],
                [[0,0,0],[1,1,1],[0,1,0]],
                [[0,1,0],[1,1,0],[0,1,0]]
            ],
            color: '#c44dff'
        },
        S: {
            shape: [
                [[0,1,1],[1,1,0],[0,0,0]],
                [[0,1,0],[0,1,1],[0,0,1]],
                [[0,0,0],[0,1,1],[1,1,0]],
                [[1,0,0],[1,1,0],[0,1,0]]
            ],
            color: '#00ff87'
        },
        Z: {
            shape: [
                [[1,1,0],[0,1,1],[0,0,0]],
                [[0,0,1],[0,1,1],[0,1,0]],
                [[0,0,0],[1,1,0],[0,1,1]],
                [[0,1,0],[1,1,0],[1,0,0]]
            ],
            color: '#ff4757'
        },
        J: {
            shape: [
                [[1,0,0],[1,1,1],[0,0,0]],
                [[0,1,1],[0,1,0],[0,1,0]],
                [[0,0,0],[1,1,1],[0,0,1]],
                [[0,1,0],[0,1,0],[1,1,0]]
            ],
            color: '#4a90d9'
        },
        L: {
            shape: [
                [[0,0,1],[1,1,1],[0,0,0]],
                [[0,1,0],[0,1,0],[0,1,1]],
                [[0,0,0],[1,1,1],[1,0,0]],
                [[1,1,0],[0,1,0],[0,1,0]]
            ],
            color: '#ff9f43'
        }
    };

    const PIECE_NAMES = Object.keys(PIECES);
    const LINE_POINTS = [0, 100, 300, 500, 800];

    function getDropInterval(level) {
        const speeds = [800, 720, 630, 550, 470, 380, 300, 220, 150, 100, 80, 70, 60, 50, 40];
        return speeds[Math.min(level - 1, speeds.length - 1)];
    }

    // ============ GAME STATE HELPERS ============
    function createBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
    }

    function createEmptyState() {
        return {
            board: createBoard(),
            currentPiece: null,
            nextPieceType: null,
            bag: [],
            score: 0,
            level: 1,
            linesCleared: 0,
            gameState: 'idle',
            heldPiece: null,
            hasHeld: false
        };
    }

    function cloneState(state) {
        return JSON.parse(JSON.stringify(state));
    }

    // ============ 7-BAG RANDOMIZER ============
    function getNextFromBag(state) {
        if (state.bag.length === 0) {
            state.bag = [...PIECE_NAMES].sort(() => Math.random() - 0.5);
        }
        return state.bag.pop();
    }

    // ============ PIECE MANAGEMENT ============
    function createPiece(state, type) {
        const pieceDef = PIECES[type];
        const shape = pieceDef.shape[0]; // always start with rotation 0
        return {
            type: type,
            rotation: 0,
            matrix: shape,
            color: pieceDef.color,
            x: Math.floor((COLS - shape.length) / 2),
            y: 0
        };
    }

    function spawnPiece(state) {
        if (!state.nextPieceType) {
            state.nextPieceType = getNextFromBag(state);
        }
        state.currentPiece = createPiece(state, state.nextPieceType);
        state.nextPieceType = getNextFromBag(state);

        // Check for game over - piece can't be placed
        if (collides(state.currentPiece.matrix, state.currentPiece.x, state.currentPiece.y)) {
            state.gameState = 'gameover';
            return true;
        }
        return false;
    }

    function collides(matrix, px, py, board) {
        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (matrix[y][x]) {
                    const newX = px + x;
                    const newY = py + y;
                    if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
                    if (newY >= 0 && board[newY][newX] !== EMPTY) return true;
                }
            }
        }
        return false;
    }

    function move(state, dx, dy) {
        const cp = state.currentPiece;
        if (!cp) return false;
        const newX = cp.x + dx;
        const newY = cp.y + dy;
        if (!collides(cp.matrix, newX, newY, state.board)) {
            cp.x = newX;
            cp.y = newY;
            return true;
        }
        return false;
    }

    function tryRotate(state) {
        const cp = state.currentPiece;
        if (!cp) return false;

        const newRotation = (cp.rotation + 1) % 4;
        const newMatrix = PIECES[cp.type].shape[newRotation];

        const kicks = [0, -1, 1, -2, 2];
        for (const kick of kicks) {
            if (!collides(newMatrix, cp.x + kick, cp.y, state.board)) {
                cp.matrix = newMatrix;
                cp.rotation = newRotation;
                cp.x += kick;
                return true;
            }
        }
        return false;
    }

    function hardDrop(state) {
        const cp = state.currentPiece;
        if (!cp) return 0;
        let dropDistance = 0;
        while (!collides(cp.matrix, cp.x, cp.y + 1, state.board)) {
            cp.y++;
            dropDistance++;
        }
        state.score += dropDistance * 2;
        return dropDistance;
    }

    function commitHardDrop(state) {
        const cp = state.currentPiece;
        if (!cp) return;
        // Lock piece at current position (already dropped by hardDrop)
        lockPiece(state);
        const clearedRows = getClearedRows(state);
        if (clearedRows.length > 0) {
            removeClearedRows(state, clearedRows);
            const info = processLineClear(state, clearedRows);
            const combo = processCombo(state, info.clearedCount);
            state._lastClearedCount = info.clearedCount;
            spawnPiece(state);
            return { ...info, ...combo };
        }
        state._lastClearedCount = 0;
        spawnPiece(state);
        return { clearedCount: 0, points: 0, hasCombo: false, bonus: 0 };
    }

    function getGhostY(state) {
        const cp = state.currentPiece;
        if (!cp) return null;
        let ghostY = cp.y;
        while (!collides(cp.matrix, cp.x, ghostY + 1, state.board)) {
            ghostY++;
        }
        return ghostY;
    }

    // ============ LOCK & CLEAR ============
    function lockPiece(state) {
        const cp = state.currentPiece;
        if (!cp) return;
        for (let y = 0; y < cp.matrix.length; y++) {
            for (let x = 0; x < cp.matrix[y].length; x++) {
                if (cp.matrix[y][x]) {
                    const boardY = cp.y + y;
                    const boardX = cp.x + x;
                    if (boardY >= 0 && boardY < ROWS) {
                        state.board[boardY][boardX] = cp.color;
                    }
                }
            }
        }
    }

    function getClearedRows(state) {
        let clearedRows = [];
        for (let y = ROWS - 1; y >= 0; y--) {
            if (state.board[y].every(cell => cell !== EMPTY)) {
                clearedRows.push(y);
            }
        }
        return clearedRows;
    }

    function removeClearedRows(state, clearedRows) {
        for (const row of clearedRows.sort((a, b) => a - b)) {
            state.board.splice(row, 1);
            state.board.unshift(Array(COLS).fill(EMPTY));
        }
    }

    function processLineClear(state, clearedRows) {
        const count = clearedRows.length;
        if (count === 0) return { clearedRows: [], clearedCount: 0, points: 0 };

        const points = LINE_POINTS[count] * state.level;
        state.score += points;
        state.linesCleared += count;
        state.level = Math.floor(state.linesCleared / 10) + 1;

        return { clearedRows, clearedCount: count, points };
    }

    // ============ HOLD SYSTEM ============
    function holdPiece(state) {
        const cp = state.currentPiece;
        if (!cp) return false;

        if (state.hasHeld) {
            // Swap mode
            const currentType = cp.type;
            state.currentPiece = createPiece(state, state.heldPiece);
            state.heldPiece = currentType;
        } else {
            // First hold: current -> held, spawn from next
            state.heldPiece = cp.type;
            state.currentPiece = null; // will be set by spawnPiece
        }
        state.hasHeld = true;

        // Spawn next piece
        spawnPiece(state);
        return true;
    }

    // ============ COMBO SYSTEM ============
    function processCombo(state, clearedCount) {
        if (clearedCount === 0) {
            state._comboCount = 0;
            return { hasCombo: false, bonus: 0 };
        }

        state._comboCount = (state._comboCount || 0) + 1;

        const bonus = state._comboCount > 1
            ? Math.floor(50 * state.level * (state._comboCount - 1))
            : 0;

        if (bonus > 0) {
            state.score += bonus;
        }

        return { hasCombo: state._comboCount > 1, bonus, comboCount: state._comboCount };
    }

    // ============ MAIN GAME LOOP STEP ============
    function dropPiece(state) {
        if (!move(state, 0, 1)) {
            // Can't move down — lock
            lockPiece(state);
            const clearedRows = getClearedRows(state);
            if (clearedRows.length > 0) {
                removeClearedRows(state, clearedRows);
                const info = processLineClear(state, clearedRows);
                const combo = processCombo(state, info.clearedCount);
                // store cleared count on state for snapshot serialization
                state._lastClearedCount = info.clearedCount;
                // spawn new piece after clearing
                spawnPiece(state);
                return { ...info, ...combo };
            }
            spawnPiece(state);
        }
        state._lastClearedCount = 0;
        return { clearedCount: 0, points: 0, hasCombo: false, bonus: 0 };
    }

    // ============ SNAPSHOT / RESTORE ============
    /** Serialize game state for network transmission */
    function serialize(state) {
        return JSON.stringify({
            board: state.board,
            currentPiece: state.currentPiece ? {
                type: state.currentPiece.type,
                rotation: state.currentPiece.rotation,
                x: state.currentPiece.x,
                y: state.currentPiece.y
            } : null,
            nextPieceType: state.nextPieceType,
            score: state.score,
            level: state.level,
            linesCleared: state.linesCleared,
            bag: state.bag,
            heldPiece: state.heldPiece,
            hasHeld: state.hasHeld,
            gameState: state.gameState,
            _lastClearedCount: state._lastClearedCount || 0,
            _comboCount: state._comboCount || 0
        });
    }

    /** Deserialize and restore game state */
    function deserialize(jsonStr) {
        const data = JSON.parse(jsonStr);
        return {
            board: data.board,
            currentPiece: data.currentPiece
                ? {
                    type: data.currentPiece.type,
                    rotation: data.currentPiece.rotation,
                    matrix: PIECES[data.currentPiece.type].shape[data.currentPiece.rotation],
                    color: PIECES[data.currentPiece.type].color,
                    x: data.currentPiece.x,
                    y: data.currentPiece.y
                }
                : null,
            nextPieceType: data.nextPieceType,
            bag: data.bag,
            score: data.score,
            level: data.level,
            linesCleared: data.linesCleared,
            heldPiece: data.heldPiece,
            hasHeld: data.hasHeld,
            gameState: data.gameState,
            _lastClearedCount: data._lastClearedCount || 0,
            _comboCount: data._comboCount || 0
        };
    }

    return {
        // Constants
        COLS,
        ROWS,
        EMPTY,
        PIECES,
        PIECE_NAMES,
        LINE_POINTS,
        getDropInterval,

        // State management
        createEmptyState,
        cloneState,

        // Game actions (mutates state)
        spawnPiece,
        move,
        tryRotate,
        hardDrop,
        getGhostY,
        lockPiece,
        getClearedRows,
        removeClearedRows,
        processLineClear,
        processCombo,
        holdPiece,
        getNextFromBag,
        createPiece,

        // Core loop step
        dropPiece,
        commitHardDrop,

        // Serialization for network
        serialize,
        deserialize,

        // Constants export for renderer
        get PIECES_CONST() { return PIECES; }
    };
})();
