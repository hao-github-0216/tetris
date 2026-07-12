/**
 * 連消系統模組 (Combo) - 多 player 版
 */
const ComboModule = (() => {
    let comboCount = 0;

    function reset() { comboCount = 0; }

    function processLineClear(linesCleared, currentLevel) {
        if (linesCleared === 0) {
            comboCount = 0;
            return { hasCombo: false, bonus: 0 };
        }

        comboCount++;
        const bonus = comboCount > 1 ? Math.floor(50 * currentLevel * (comboCount - 1)) : 0;
        return { hasCombo: comboCount > 1, bonus };
    }

    function getComboCount() { return comboCount; }

    return { processLineClear, reset, getComboCount };
})();
