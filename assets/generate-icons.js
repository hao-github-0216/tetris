/**
 * Generate Tetris app icons from SVG source
 * Outputs: logo-512.png, logo-192.png, logo-180.png, logo-167.png, logo-152.png
 */
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const SIZES = [512, 192, 180, 167, 152];
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

function drawLogo(canvas, size) {
    const ctx = canvas.getContext('2d');
    const r = size * 0.22; // corner radius
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
        // Row 0: I(cyan), S(purple), Z(red)
        { x: 0, y: 0, color: COLORS.cyan },
        { x: 1, y: 0, color: COLORS.purple },
        { x: 2, y: 0, color: COLORS.red },
        // Row 1: J(teal), O(gold), L(pink)
        { x: 0, y: 1, color: COLORS.teal },
        { x: 1, y: 1, color: COLORS.gold },
        { x: 2, y: 1, color: COLORS.pink },
        // Row 2: I(cyan)
        { x: 1, y: 2, color: COLORS.cyan },
    ];

    ctx.fillStyle = COLORS.cyan;
    for (const p of positions) {
        const bx = margin + p.x * (blockSize + gap);
        const by = margin + p.y * (blockSize + gap);
        const br = gap * 0.8;
        ctx.fillStyle = p.color;
        roundRect(ctx, bx, by, blockSize, blockSize, br);
        ctx.fill();
    }
}

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

const assetsDir = path.join(__dirname);
for (const size of SIZES) {
    const canvas = createCanvas(size, size);
    drawLogo(canvas, size);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(assetsDir, `logo-${size}.png`), buffer);
    console.log(`✓ Generated logo-${size}.png (${size}x${size})`);
}

console.log('All icons generated successfully!');
