/**
 * 最高分模組 - localStorage 持久化
 * 記錄每個等級段的最佳分數
 */
const HighScoreModule = (() => {
    const STORAGE_KEY = 'tetris-highscores';

    function getScores() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function saveScore(newScore, level) {
        const scores = getScores();
        scores.push({ score: newScore, level, lines: 0 }); // lines set by caller if needed
        // Sort descending and keep top 10
        scores.sort((a, b) => b.score - a.score);
        if (scores.length > 10) scores.length = 10;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
        return scores[0]; // best score
    }

    function getBestScore() {
        const scores = getScores();
        return scores.length > 0 ? scores[0].score : 0;
    }

    function getHighScoreHTML() {
        const scores = getScores();
        if (scores.length === 0) {
            return '<div style="text-align:center;color:#666;font-size:12px;">暫無記錄</div>';
        }
        let html = '';
        for (let i = 0; i < Math.min(scores.length, 5); i++) {
            const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
            html += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
                <span>${medal}</span>
                <span style="color:#7fdbca;">${scores[i].score.toLocaleString()}</span>
                <span style="color:#888;">Lv.${scores[i]?.level || '-'}</span>
            </div>`;
        }
        return html;
    }

    return { getScores, saveScore, getBestScore, getHighScoreHTML };
})();
