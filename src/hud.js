// ─── HUD SETUP ───────────────────────────────────────────────────────────────
// Speedometer canvas renderer
let speedCanvas, speedCtx;
let compassCanvas, compassCtx;

export function setupHUD() {
    speedCanvas = document.getElementById('speed-canvas');
    speedCtx = speedCanvas.getContext('2d');

    compassCanvas = document.getElementById('compass-canvas');
    compassCtx = compassCanvas.getContext('2d');

    // Animate HUD
    animateHUD();
}

function animateHUD() {
    requestAnimationFrame(animateHUD);

    const speed = window._hud_speed ?? 0;
    const yaw = window._hud_yaw ?? 0;

    drawSpeedometer(speed);
    drawCompass(yaw);

    // Speed value text
    document.getElementById('speed-value').textContent = Math.round(speed);
}

// ─── SPEEDOMETER ─────────────────────────────────────────────────────────────
function drawSpeedometer(speed) {
    const W = 160, H = 160, cx = W / 2, cy = H / 2, r = 68;
    const ctx = speedCtx;
    ctx.clearRect(0, 0, W, H);

    const MAX = 140; // KM/H displayed max
    const pct = Math.min(speed / MAX, 1);

    // ── Background ──
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fill();

    // ── Track ──
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, -Math.PI * 0.75, Math.PI * 0.75);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();

    // ── Speed arc ──
    const startAngle = -Math.PI * 0.75;
    const endAngle = startAngle + pct * Math.PI * 1.5;

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#00ffcc');
    grad.addColorStop(0.6, '#00bbff');
    grad.addColorStop(1, speed > 100 ? '#ff4444' : '#7766ff');

    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, startAngle, endAngle);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();

    // ── Glow when fast ──
    if (speed > 80) {
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 5, endAngle - 0.05, endAngle);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // ── Tick marks ──
    for (let i = 0; i <= 14; i++) {
        const a = -Math.PI * 0.75 + (i / 14) * Math.PI * 1.5;
        const inner = i % 2 === 0 ? r - 20 : r - 16;
        const outer = r - 10;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = i % 2 === 0 ? 1.5 : 1;
        ctx.stroke();
    }

    // ── Needle ──
    const needleAngle = -Math.PI * 0.75 + pct * Math.PI * 1.5;
    const nr = r - 18;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needleAngle);
    ctx.beginPath();
    ctx.moveTo(-3, 4);
    ctx.lineTo(-1, -nr);
    ctx.lineTo(1, -nr);
    ctx.lineTo(3, 4);
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();

    // ── Center cap ──
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
}

// ─── COMPASS ─────────────────────────────────────────────────────────────────
function drawCompass(yaw) {
    const W = 70, H = 70, cx = W / 2, cy = H / 2, r = 30;
    const ctx = compassCtx;
    ctx.clearRect(0, 0, W, H);

    // ── Background ──
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Cardinal marks ──
    const cardinals = [
        { label: 'N', a: -yaw },
        { label: 'E', a: -yaw + Math.PI / 2 },
        { label: 'S', a: -yaw + Math.PI },
        { label: 'W', a: -yaw - Math.PI / 2 },
    ];
    cardinals.forEach(({ label, a }) => {
        const tx = cx + Math.sin(a) * (r - 8);
        const ty = cy - Math.cos(a) * (r - 8);
        ctx.font = `bold 7px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = label === 'N' ? '#ff3333' : 'rgba(255,255,255,0.45)';
        ctx.fillText(label, tx, ty);
    });

    // ── Needle ──
    const northAngle = -yaw;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(northAngle);
    ctx.beginPath();
    ctx.moveTo(0, -(r - 14));
    ctx.lineTo(-3, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(3, 0);
    ctx.closePath();
    ctx.fillStyle = '#ff3333';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, (r - 14));
    ctx.lineTo(-3, 0);
    ctx.lineTo(0, -5);
    ctx.lineTo(3, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
    ctx.restore();

    // Center
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
}
