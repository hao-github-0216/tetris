/**
 * 音效模組 - 使用 Web Audio API
 * 提供落塊、消行、旋轉等復古風格音效
 */
const SoundModule = (() => {
    let audioCtx = null;

    function init() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playTone(frequency, duration, type = 'square', volume = 0.15) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    function playLock() { init(); playTone(200, 0.1, 'square', 0.12); }
    function playMove() { init(); playTone(400, 0.05, 'sine', 0.08); }
    function playRotate() { init(); playTone(600, 0.06, 'triangle', 0.1); }

    function playHardDrop() {
        init();
        // Deep thud + short high blip
        playTone(100, 0.2, 'sawtooth', 0.18);
        setTimeout(() => playTone(300, 0.08, 'square', 0.1), 50);
    }

    function playLineClear(count) {
        init();
        const baseFreq = [440, 554, 659, 880]; // A4, C#5, E5, A5
        for (let i = 0; i < count; i++) {
            setTimeout(() => playTone(baseFreq[count - 1] || baseFreq[0], 0.2, 'square', 0.15), i * 80);
        }
    }

    function playGameOver() {
        init();
        const notes = [400, 350, 300, 250, 200];
        notes.forEach((freq, i) => setTimeout(() => playTone(freq, 0.25, 'sawtooth', 0.12), i * 150));
    }

    function playCombo(count) {
        init();
        const base = [523, 659, 784, 1047]; // C5, E5, G5, C6
        for (let i = 0; i < Math.min(count + 1, 4); i++) {
            setTimeout(() => playTone(base[i], 0.15, 'triangle', 0.12), i * 60);
        }
    }

    function playHoldSwap() { init(); playTone(800, 0.08, 'sine', 0.1); setTimeout(() => playTone(900, 0.08, 'sine', 0.1), 60); }

    return { playLock, playMove, playRotate, playHardDrop, playLineClear, playGameOver, playCombo, playHoldSwap };
})();
