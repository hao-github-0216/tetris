/**
 * Generate iOS 1024x1024 app icon from Tetris SVG design
 * Outputs: apple-touch-icon.png (1024x1024)
 */
const { createCanvas } = require('canvas');

const COLORS = {
    bg: '#0a0a2e',
    border: '#4a90d9',
    cyan: '#00f5ff',
    purple: '#c44dff',
    red: '#ff4757',
    teal: '#7fdbca',
    gold: '#ffd700',
    pink: '#ff6b9d',
};

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawLogo(canvas, size) {
    const ctx = canvas.getContext('2d');
    const r = size * 0.22;
    const margin = size * 0.03;

    // Background rounded rect
    ctx.fillStyle = COLORS.bg;
    roundRect(ctx, margin, margin, size - margin * 2, size - margin * 2, r * 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = size * 0.024;
    roundRect(ctx, margin, margin, size - margin * 2, size - margin * 2, r * 4);
    ctx.stroke();

    // Draw 7 tetromino blocks in a grid pattern
    const blockSize = (size - margin * 2) / 3.2;
    const gap = blockSize * 0.12;
    const positions = [
        { x: 0, y: 0, color: COLORS.cyan },
        { x: 1, y: 0, color: COLORS.purple },
        { x: 2, y: 0, color: COLORS.red },
        { x: 0, y: 1, color: COLORS.teal },
        { x: 1, y: 1, color: COLORS.gold },
        { x: 2, y: 1, color: COLORS.pink },
        { x: 1, y: 2, color: COLORS.cyan },
    ];

    for (const p of positions) {
        const bx = margin + p.x * (blockSize + gap);
        const by = margin + p.y * (blockSize + gap);
        const br = gap * 0.8;
        ctx.fillStyle = p.color;
        roundRect(ctx, bx, by, blockSize, blockSize, br);
        ctx.fill();
    }
}

const canvas = createCanvas(1024, 1024);
drawLogo(canvas, 1024);
const fs = require('fs');
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('/Volumes/External/projects/tetris/apple-touch-icon.png', buffer);
console.log(`✓ Generated apple-touch-icon.png (1024x1024) - ${buffer.length} bytes`);
