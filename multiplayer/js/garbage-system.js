/**
 * 垃圾行系統
 * 對抗模式下，消行會送回垃圾行給對方
 * 規則：每消 N 行，對方收到 max(0, N-1) 行垃圾
 */
const GarbageSystem = (() => {
    const COLS = 10;

    /**
     * 根據消行數計算應送回多少垃圾行
     * 標準規則：
     * 1 行 → 0 行垃圾
     * 2 行 → 1 行垃圾
     * 3 行 → 2 行垃圾
     * 4 行（Tetris）→ 4 行垃圾
     */
    function getGarbageLines(clearedLines) {
        if (clearedLines <= 1) return 0;
        if (clearedLines === 2) return 1;
        if (clearedLines === 3) return 2;
        if (clearedLines >= 4) return 4;
        return 0;
    }

    /**
     * 生成單一垃圾行（10 格中有 1 個隨機空洞）
     */
    function generateOneGarbageLine() {
        const holeIndex = Math.floor(Math.random() * COLS);
        const line = Array(COLS).fill(1);
        line[holeIndex] = 0; // 0 = 空洞
        return { line, holeIndex };
    }

    /**
     * 生成多行垃圾
     * @param {number} count — 垃圾行數
     * @returns {Array<{line: number[], holeIndex: number}>}
     */
    function generateGarbageLines(count) {
        const lines = [];
        for (let i = 0; i < count; i++) {
            lines.push(generateOneGarbageLine());
        }
        return lines;
    }

    /**
     * 將垃圾行插入指定版面的頂部
     * @param {number[][]} board — 20 行 10 列的版面
     * @param {Array<{line: number[], holeIndex: number}>} garbageLines — 垃圾行列表
     * @returns {number[][]} 更新後的版面
     */
    function insertGarbageLines(board, garbageLines) {
        const newBoard = board.slice(); // clone

        for (const gLine of garbageLines) {
            // 先移除最頂部一行（有效內容被推上去了）
            newBoard.shift();
            // 在底部插入新的垃圾行
            newBoard.push(gLine.line.slice());
        }

        return newBoard;
    }

    /**
     * 檢查垃圾行處理：當玩家用正常方塊填平一個有洞的行（消行）時，
     * 該行不算真正的垃圾行清除（不送回垃圾）
     * 
     * @param {number[][]} board — 目前的版面
     * @param {number[]} clearedRows — 已清除的行索引
     * @param {Array<{line: number[], holeIndex: number}>} garbageLines — 垃圾行列表（用來判斷哪些行是垃圾）
     * @returns {{ realCleared: number, garbageRowsCleared: number }}
     */
    function processGarbageClear(board, clearedRows, garbageLines) {
        // 簡單處理：全歸為真實清除（MVP 版本不區分垃圾/正常行）
        // 進階版可以追蹤哪些行是垃圾行
        return { realCleared: clearedRows.length, garbageRowsCleared: 0 };
    }

    return {
        getGarbageLines,
        generateGarbageLines,
        insertGarbageLines,
        processGarbageClear,
        generateOneGarbageLine
    };
})();
