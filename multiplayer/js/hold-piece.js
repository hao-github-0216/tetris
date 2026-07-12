/**
 * Hold 功能模組 - 多 player 版
 */
const HoldModule = (() => {
    let heldPiece = null;
    let onSwapPlayed = null; // callback for sound

    function setOnSwapPlayed(fn) { onSwapPlayed = fn; }

    function tryHold(createPiece, getCurrentPiece, getCurrentGameState) {
        const cp = getCurrentPiece();
        const gs = getCurrentGameState();
        if (!cp || gs !== 'playing') return false;

        const currentType = cp.type;

        if (heldPiece) {
            const newPiece = createPiece(heldPiece);
            getCurrentPiece().currentPiece = newPiece;
            heldPiece = currentType;
        } else {
            heldPiece = currentType;
            getCurrentPiece().spawnPiece();
        }

        if (onSwapPlayed) onSwapPlayed();
        return true;
    }

    function reset() { heldPiece = null; }
    function getHeldType() { return heldPiece; }

    return {
        tryHold, reset, getHeldType, setOnSwapPlayed,
        get hasPiece() { return heldPiece !== null; }
    };
})();
