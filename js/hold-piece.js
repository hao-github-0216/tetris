/**
 * Hold 功能模組
 * 按 C 鍵將當前方塊存入 Hold 區，換出已 Hold 的方塊
 *
 * 正確邏輯（現代俄羅斯方塊）：
 * 1. 第一次按保留：當前下落方塊 → 保留區，Next 方塊 → 下落方塊，生成新的 Next
 * 2. 之後按保留：當前下落方塊 ↔ 保留區互相交換，生成新的 Next
 * 3. 只要遊戲進行中，可以無限次按保留按鈕
 */
const HoldModule = (() => {
    let heldPiece = null;

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
        const cp = window.__tetris.currentPiece;
        const gs = window.__tetris.gameState;
        // 只有在遊戲進行中且有當前方塊時才能保留
        if (!cp || gs !== 'playing') return false;

        const currentType = cp.type;

        if (heldPiece) {
            // 交換模式：已 Hold 過一次，現在交換回 Holder 方塊
            // 1. 當前方塊存入保留區
            // 2. 保留區的方塊變成新的下落方塊
            window.__tetris.currentPiece = window.__tetris.createPiece(heldPiece);
            heldPiece = currentType;

            const hctx = getHoldCanvas().getContext('2d');
            drawHoldPiece(hctx, getHoldCanvas(), heldPiece);
        } else {
            // 第一次保留：將當前方塊存入保留區，換出 Next 方塊
            heldPiece = currentType;
            window.__tetris.spawnPiece();

            const hctx = getHoldCanvas().getContext('2d');
            drawHoldPiece(hctx, getHoldCanvas(), heldPiece);
        }

        SoundModule.playHoldSwap();
        return true;
    }

    function reset() {
        heldPiece = null;
    }

    function getHeldType() { return heldPiece; }

    return {
        tryHold, reset, getHeldType,
        get hasPiece() { return heldPiece !== null; },
        redrawHold: () => {
            const canvas = getHoldCanvas();
            if (heldPiece && canvas) {
                drawHoldPiece(canvas.getContext('2d'), canvas, heldPiece);
            }
        }
    };
})();
