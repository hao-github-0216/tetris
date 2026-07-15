/**
 * 俄羅斯方塊多人模式渲染器
 * 支援主面板（自己的遊戲）+ 副面板（對手的遊戲）
 */
const MultiplayerRenderer = (() => {
    const BLOCK_SIZE_DESKTOP = 30;

    /**
     * 建立渲染器實例
     * @param {string} mainCanvasId — 主 Canvas ID（自己的遊戲）
     * @param {string} opponentCanvasId — 副 Canvas ID（對手的遊戲，可為 null）
     * @param {object} gameCore — GameCore 模組
     * @returns {object} 渲染器實例
     */
    function create(mainCanvasId, opponentCanvasId, gameCore) {
        const mainCanvas = document.getElementById(mainCanvasId);
        const mainCtx = mainCanvas ? mainCanvas.getContext('2d') : null;

        const opponentCanvas = opponentCanvasId ? document.getElementById(opponentCanvasId) : null;
        const opponentCtx = opponentCanvas ? opponentCanvas.getContext('2d') : null;

        const COLS = gameCore.COLS;
        const ROWS = gameCore.ROWS;
        const EMPTY = gameCore.EMPTY;
        const PIECES = gameCore.PIECES;

        // ============ BLOCK RENDERING ============
        function drawBlock(ctx, x, y, color, size) {
            const padding = 1;
            ctx.fillStyle = color;
            ctx.fillRect(x * size + padding, y * size + padding, size - padding * 2, size - padding * 2);

            // Highlight (top-left)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(x * size + padding, y * size + padding, size - padding * 2, 4);
            ctx.fillRect(x * size + padding, y * size + padding, 4, size - padding * 2);

            // Shadow (bottom-right)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(x * size + padding, (y + 1) * size - padding - 4, size - padding * 2, 4);
            ctx.fillRect((x + 1) * size - padding - 4, y * size + padding, 4, size - padding * 2);
        }

        function getBlockSize() {
            if (window.matchMedia('(max-width: 600px)').matches) {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const bodyStyle = getComputedStyle(document.body);
                const safeTop = parseFloat(bodyStyle.paddingTop) || 0;
                const safeBottom = parseFloat(bodyStyle.paddingBottom) || 0;
                const infoBarHeight = 20;
                const previewsHeight = 60;
                const controlsHeight = 36;
                const totalReserved = infoBarHeight + previewsHeight + controlsHeight;
                const availWidth = Math.min(vw - 16, 360);
                const availHeight = Math.max(vh - totalReserved - safeTop - safeBottom, ROWS * 20);
                const blockW = Math.floor(availWidth / COLS);
                const blockH = Math.floor(availHeight / ROWS);
                return Math.max(Math.min(blockW, blockH, 30), 20);
            }
            return BLOCK_SIZE_DESKTOP;
        }

        // ============ MAIN BOARD RENDERING ============
        function drawMainBoard(state) {
            if (!mainCtx) return;
            const size = getBlockSize();
            mainCanvas.width = COLS * size;
            mainCanvas.height = ROWS * size;

            // Clear
            mainCtx.fillStyle = '#1a1a3e';
            mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

            // Grid lines
            mainCtx.strokeStyle = 'rgba(74, 144, 217, 0.1)';
            mainCtx.lineWidth = 0.5;
            for (let x = 0; x <= COLS; x++) {
                mainCtx.beginPath();
                mainCtx.moveTo(x * size, 0);
                mainCtx.lineTo(x * size, mainCanvas.height);
                mainCtx.stroke();
            }
            for (let y = 0; y <= ROWS; y++) {
                mainCtx.beginPath();
                mainCtx.moveTo(0, y * size);
                mainCtx.lineTo(mainCanvas.width, y * size);
                mainCtx.stroke();
            }

            // Locked blocks
            const board = state.board;
            for (let y = 0; y < ROWS; y++) {
                for (let x = 0; x < COLS; x++) {
                    if (board[y][x] !== EMPTY) {
                        drawBlock(mainCtx, x, y, board[y][x], size);
                    }
                }
            }

            // Ghost piece
            if (state.currentPiece && state.gameState === 'playing') {
                const cp = state.currentPiece;
                let ghostY = cp.y;
                while (ghostY + 1 < ROWS) {
                    let canDrop = true;
                    for (let yy = 0; yy < cp.matrix.length; yy++) {
                        for (let xx = 0; xx < cp.matrix[yy].length; xx++) {
                            if (cp.matrix[yy][xx]) {
                                const bx = cp.x + xx;
                                const by = ghostY + 1 + yy;
                                if (by >= ROWS || board[by][bx] !== EMPTY) {
                                    canDrop = false;
                                }
                            }
                        }
                    }
                    if (!canDrop) break;
                    ghostY++;
                }
                mainCtx.globalAlpha = 0.2;
                for (let y = 0; y < cp.matrix.length; y++) {
                    for (let x = 0; x < cp.matrix[y].length; x++) {
                        if (cp.matrix[y][x]) {
                            drawBlock(mainCtx, cp.x + x, ghostY + y, cp.color, size);
                        }
                    }
                }
                mainCtx.globalAlpha = 1.0;

                // Current piece
                for (let y = 0; y < cp.matrix.length; y++) {
                    for (let x = 0; x < cp.matrix[y].length; x++) {
                        if (cp.matrix[y][x]) {
                            drawBlock(mainCtx, cp.x + x, cp.y + y, cp.color, size);
                        }
                    }
                }
            }
        }

        // ============ NEXT PIECE PREVIEW ============
        function drawNextPiece(state) {
            const canvas = document.getElementById('next-piece-canvas');
            const ctx = canvas ? canvas.getContext('2d') : null;
            if (!ctx || !state.nextPieceType) return;

            const canvasSize = canvas.width;
            ctx.fillStyle = '#1a1a3e';
            ctx.fillRect(0, 0, canvasSize, canvasSize);

            const pieceDef = PIECES[state.nextPieceType];
            const matrix = pieceDef.shape[0];
            const blockSize = 20;
            const size = matrix.length;

            const offsetX = (canvasSize - size * blockSize) / 2 / blockSize;
            const offsetY = (canvasSize - size * blockSize) / 2 / blockSize;

            for (let y = 0; y < matrix.length; y++) {
                for (let x = 0; x < matrix[y].length; x++) {
                    if (matrix[y][x]) {
                        const px = (x + offsetX) * blockSize;
                        const py = (y + offsetY) * blockSize;
                        ctx.fillStyle = pieceDef.color;
                        ctx.fillRect(px + 1, py + 1, blockSize - 2, blockSize - 2);
                        ctx.fillStyle = 'rgba(255,255,255,0.3)';
                        ctx.fillRect(px + 1, py + 1, blockSize - 2, 3);
                        ctx.fillRect(px + 1, py + 1, 3, blockSize - 2);
                    }
                }
            }
        }

        // ============ HOLD PIECE PREVIEW ============
        function drawHoldPiece(state) {
            const canvas = document.getElementById('hold-piece-canvas');
            const ctx = canvas ? canvas.getContext('2d') : null;
            if (!ctx) return;

            const canvasSize = canvas.width;
            ctx.fillStyle = '#1a1a3e';
            ctx.fillRect(0, 0, canvasSize, canvasSize);

            if (state.heldPiece) {
                const pieceDef = PIECES[state.heldPiece];
                const matrix = pieceDef.shape[0];
                const blockSize = 20;
                const size = matrix.length;

                const offsetX = (canvasSize - size * blockSize) / 2 / blockSize;
                const offsetY = (canvasSize - size * blockSize) / 2 / blockSize;

                for (let y = 0; y < matrix.length; y++) {
                    for (let x = 0; x < matrix[y].length; x++) {
                        if (matrix[y][x]) {
                            const px = (x + offsetX) * blockSize;
                            const py = (y + offsetY) * blockSize;
                            ctx.fillStyle = pieceDef.color;
                            ctx.fillRect(px + 1, py + 1, blockSize - 2, blockSize - 2);
                            ctx.fillStyle = 'rgba(255,255,255,0.3)';
                            ctx.fillRect(px + 1, py + 1, blockSize - 2, 3);
                            ctx.fillRect(px + 1, py + 1, 3, blockSize - 2);
                        }
                    }
                }
            }
        }

        // ============ OPPONENT MINIMAP RENDERING ============
        function drawOpponentBoard(snapshot) {
            if (!opponentCtx || !opponentCanvas || !snapshot) return;

            const miniSize = 160;
            const miniBlock = Math.floor(miniSize / COLS);

            opponentCanvas.width = miniSize;
            opponentCanvas.height = miniSize;

            opponentCtx.fillStyle = '#1a1a3e';
            opponentCtx.fillRect(0, 0, miniSize, miniSize);

            const board = snapshot.board;
            const cp = snapshot.currentPiece;

            // Draw locked blocks
            for (let y = 0; y < ROWS; y++) {
                for (let x = 0; x < COLS; x++) {
                    if (board[y][x] !== EMPTY) {
                        opponentCtx.fillStyle = board[y][x];
                        opponentCtx.fillRect(x * miniBlock + 1, y * miniBlock + 1, miniBlock - 2, miniBlock - 2);
                    }
                }
            }

            // Draw current piece if present
            if (cp) {
                for (let y = 0; y < cp.matrix.length; y++) {
                    for (let x = 0; x < cp.matrix[y].length; x++) {
                        if (cp.matrix[y][x]) {
                            opponentCtx.fillStyle = cp.color;
                            opponentCtx.fillRect(
                                (cp.x + x) * miniBlock + 1,
                                (cp.y + y) * miniBlock + 1,
                                miniBlock - 2,
                                miniBlock - 2
                            );
                        }
                    }
                }
            }
        }

        // ============ INFO DISPLAY ============
        function updateInfo(state) {
            const scoreEl = document.getElementById('mp-score');
            const levelEl = document.getElementById('mp-level');
            const linesEl = document.getElementById('mp-lines');

            if (scoreEl) scoreEl.textContent = state.score.toLocaleString();
            if (levelEl) levelEl.textContent = state.level;
            if (linesEl) linesEl.textContent = state.linesCleared;
        }

        // Opponent info display
        function updateOpponentInfo(snapshot) {
            const scoreEl = document.getElementById('mp-other-score');
            const levelEl = document.getElementById('mp-other-level');
            const linesEl = document.getElementById('mp-other-lines');

            if (scoreEl) scoreEl.textContent = (snapshot.score || 0).toLocaleString();
            if (levelEl) levelEl.textContent = (snapshot.level || 1);
            if (linesEl) linesEl.textContent = (snapshot.linesCleared || 0);
        }

        // ============ FULL RENDER ============
        function render(state, opponentSnapshot) {
            drawMainBoard(state);
            drawNextPiece(state);
            drawHoldPiece(state);
            drawOpponentBoard(opponentSnapshot);
            updateInfo(state);
            updateOpponentInfo(opponentSnapshot);
        }

        return {
            render,
            drawOpponentBoard,
            updateInfo,
            updateOpponentInfo,
            resize: () => {
                // Trigger re-render
            }
        };
    }

    return { create };
})();
