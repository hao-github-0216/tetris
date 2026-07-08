/**
 * Hold 功能模組
 * 按 C 鍵將當前方塊存入 Hold 區，換出已 Hold 的方塊
 * 每個回合只能使用一次 Hold
 */
const HoldModule = (() => {
    let heldPiece = null;
    let hasHeld = false;

    function getHoldCanvas() {
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        const canvas = isMobile 
            ? document.getElementById('hold-piece-canvas-mobile')
            : document.getElementById('hold-piece-canvas');
        return canvas;
    }

    /**
     * 在 Hold 畫布上繪製指定類型的方塊
     */
    function drawHoldPiece(ctx, canvas, type) {
        if (!type || !window.__tetris.PIECES[type]) return;
        const pieceDef = window.__tetris.PIECES[type];
        const matrix = pieceDef.shape[0];

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const size = matrix.length;
        const blockSz = 20;
        const offsetX = (canvas.width - size * blockSz) / 2 / blockSz;
        const offsetY = (canvas.height - size * blockSz) / 2 / blockSz;

        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (matrix[y][x]) {
                    const px = (x + offsetX) * blockSz;
                    const py = (y + offsetY) * blockSz;
                    ctx.fillStyle = pieceDef.color;
                    ctx.fillRect(px + 1, py + 1, blockSz - 2, blockSz - 2);
                    // Highlight
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.fillRect(px + 1, py + 1, blockSz - 2, 3);
                    ctx.fillRect(px + 1, py + 1, 3, blockSz - 2);
                }
            }
        }
    }

    /**
     * 嘗試執行 Hold 操作
     * @returns {boolean} 是否成功執行
     */
    function tryHold() {
        if (!window.__tetris.currentPiece || hasHeld || window.__tetris.gameState !== 'playing') return false;

        const currentType = window.__tetris.currentPiece.type;

        if (heldPiece) {
            // Swap: put current into hold, take held out
            window.__tetris.currentPiece = window.__tetris.createPiece(heldPiece);
            heldPiece = currentType;

            drawHoldPiece(getHoldCanvas().getContext('2d'), getHoldCanvas(), heldPiece);
        } else {
            // First hold: save current piece and spawn a new one
            heldPiece = currentType;
            hasHeld = true;
            window.__tetris.spawnPiece();

            const hctx = getHoldCanvas().getContext('2d');
            drawHoldPiece(hctx, getHoldCanvas(), heldPiece);
        }

        SoundModule.playHoldSwap();
        return true;
    }

    function reset() {
        heldPiece = null;
        hasHeld = false;
    }

    function getHeldType() { return heldPiece; }

    return { tryHold, reset, getHeldType, redrawHold: () => {
        const canvas = getHoldCanvas();
        if (heldPiece && canvas) {
            drawHoldPiece(canvas.getContext('2d'), canvas, heldPiece);
        }
    }};
})();
