/**
 * 連消系統模組 - Combo
 * 連續清除方塊（中間沒有未清除的行）時觸發連消，給予額外分數和視覺特效
 */
const ComboModule = (() => {
    let comboCount = 0;

    function reset() { comboCount = 0; }

    /**
     * @param {number} linesCleared - 本回合清除的行數 (0 表示沒清除)
     * @param {number} currentLevel - 當前等級
     * @returns {{ hasCombo: boolean, bonus: number }}
     */
    function processLineClear(linesCleared, currentLevel) {
        if (linesCleared === 0) {
            comboCount = 0;
            return { hasCombo: false, bonus: 0 };
        }

        comboCount++;

        // Combo bonus: 50 * level * (combo - 1)
        const bonus = comboCount > 1 ? Math.floor(50 * currentLevel * (comboCount - 1)) : 0;

        return { hasCombo: comboCount > 1, bonus };
    }

    function getComboCount() { return comboCount; }

    return { processLineClear, reset, getComboCount };
})();
