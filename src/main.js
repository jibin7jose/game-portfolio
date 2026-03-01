import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// ═══════════════════════════════════════════════════════════════
//  RENDERER
// ═══════════════════════════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4; // Pro exposure for vibrant neons
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').prepend(renderer.domElement);

// Add global styles for the "Accident" flash effect
const style = document.createElement('style');
style.textContent = `
    @keyframes crashFlash {
        0% { opacity: 0; }
        20% { opacity: 1; }
        100% { opacity: 0; }
    }
`;
style.textContent += `
    .accident-blur {
        filter: blur(8px) saturate(0.5) contrast(1.2);
        transition: filter 0.1s ease-out;
    }
`;
document.head.appendChild(style);

// ═══════════════════════════════════════════════════════════════
//  SCENE + CAMERA
// ═══════════════════════════════════════════════════════════════
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 12, 30);

// ═══════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    // only prevent scroll keys
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

let mouseDX = 0, mouseDY = 0;
window.addEventListener('mousemove', e => {
    if (e.buttons === 2) { mouseDX += e.movementX; mouseDY += e.movementY; }
});
window.addEventListener('contextmenu', e => e.preventDefault());

// ═══════════════════════════════════════════════════════════════
//  PHYSICS CONSTANTS
// ═══════════════════════════════════════════════════════════════
const MAX_SPEED = 28;
const BOOST_SPEED = 48;
const ACCEL = 22;
const BRAKE_FORCE = 42;
const REV_SPEED = 10;
const MAX_STEER = 0.52;
const STEER_RATE = 5.5;

// ═══════════════════════════════════════════════════════════════
//  VEHICLE STATE (velocity-vector drift physics)
// ═══════════════════════════════════════════════════════════════
const carRoot = new THREE.Group();
let carSpeed = 0;      // scalar speed along facing
let carSteer = 0;
let boostFuel = 100;
let isDrifting = false;
let driftFactor = 0;    // 0=no drift, 1=full drift
let driftSmoke = 0;

// Velocity vector for drift simulation
const carVel = new THREE.Vector3();

// Collision & reflection state
let collidables = [];                  // city meshes for collision
let collisionNearby = [];              // spatially-filtered subset
let cubeRenderTarget = null;           // car body env-map target
let envCubeCamera = null;            // CubeCamera for reflections
let frameCount = 0;                    // frame counter
let screenShakeAmt = 0;              // fades after bump
let lastCollisionTime = 0;            // collision sound cooldown
let stuckTimer = 0;                  // emergency warp timer
const _cvTmp = new THREE.Vector3();   // reusable scratch vector
const lastSafePos = new THREE.Vector3(35, 0.1, 65);

let cameraMode = 0;   // 0=chase  1=cockpit  2=orbit
let camYaw = 0;
let camPitch = 0.35;

const camPos = new THREE.Vector3(0, 12, 30);
const camLook = new THREE.Vector3();
let carWheels = [];

let camSwitchedLastFrame = false;
let resetPressedLastFrame = false;

// ═══════════════════════════════════════════════════════════════
//  WEB AUDIO — ENGINE SOUND (no files needed)
// ═══════════════════════════════════════════════════════════════
let audioCtx = null, engineOsc = null, engineGain = null;
let driftOsc = null, driftGain = null;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // --- Engine: layered oscillators ---
    const oscA = audioCtx.createOscillator();
    const oscB = audioCtx.createOscillator();
    oscA.type = 'sawtooth'; oscA.frequency.value = 60;
    oscB.type = 'square'; oscB.frequency.value = 63;

    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0.06;

    const distortion = audioCtx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = (i / 128 - 1) > 0 ? 1 : -1;
    distortion.curve = curve;

    oscA.connect(distortion);
    oscB.connect(engineGain);
    distortion.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    oscA.start(); oscB.start();
    engineOsc = oscA;

    // --- Tyre screech: band-pass noise ---
    const bufLen = audioCtx.sampleRate * 0.5;
    const noiseBuf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuf; noiseNode.loop = true;
    const bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 1200; bpf.Q.value = 2;
    driftGain = audioCtx.createGain(); driftGain.gain.value = 0;
    noiseNode.connect(bpf); bpf.connect(driftGain); driftGain.connect(audioCtx.destination);
    noiseNode.start();
    driftOsc = noiseNode;
}

function updateAudio(speed, boosting, drifting) {
    if (!audioCtx || !engineOsc) return;
    const kmh = Math.abs(speed) * 3.6;
    // Engine pitch: idle ~60Hz, max ~240Hz
    const targetFreq = 60 + (kmh / 160) * 240 + (boosting ? 40 : 0);
    engineOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.05);
    // Engine volume: idle soft, revving medium
    const targetGain = 0.04 + (kmh / 160) * 0.14 + (boosting ? 0.04 : 0);
    engineGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);
    // Tyre screech
    const screeVol = drifting ? 0.3 : 0;
    driftGain.gain.setTargetAtTime(screeVol, audioCtx.currentTime, 0.08);
}

// Kick audio on any user interaction
window.addEventListener('keydown', () => initAudio(), { once: false });

// Sound mute toggle — called from HTML button
let soundMuted = false;
window.toggleSound = function () {
    initAudio();
    soundMuted = !soundMuted;
    if (audioCtx) {
        soundMuted ? audioCtx.suspend() : audioCtx.resume();
    }
    const btn = document.getElementById('sound-btn');
    const label = btn.querySelector('.sound-label');
    if (soundMuted) {
        btn.classList.add('muted');
        if (label) label.textContent = 'SOUND OFF';
    } else {
        btn.classList.remove('muted');
        if (label) label.textContent = 'SOUND ON';
    }
};

// Drift indicator element
const driftIndicatorEl = document.getElementById('drift-indicator');

// ═══════════════════════════════════════════════════════════════
//  FALLBACK BOX CAR
// ═══════════════════════════════════════════════════════════════
function buildBoxCar() {
    const g = new THREE.Group();

    const green = new THREE.MeshStandardMaterial({ color: 0x3d6b3d, roughness: 0.5, metalness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2b1a, roughness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, roughness: 0.1 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x777788, roughness: 0.3, metalness: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 4.4), green);
    body.position.y = 0.6; body.castShadow = true; g.add(body);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.0), green);
    cab.position.set(0, 1.25, 0.3); cab.castShadow = true; g.add(cab);

    const wind = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), glass);
    wind.position.set(0, 1.2, 1.32); wind.rotation.x = -0.18; g.add(wind);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 1.5), green);
    hood.position.set(0, 1.02, 1.65); g.add(hood);

    const bump = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 0.2), dark);
    bump.position.set(0, 0.42, 2.28); g.add(bump);

    // headlights
    const lensM = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 5 });
    [-0.65, 0.65].forEach(x => {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.14, 10), lensM.clone());
        l.position.set(x, 0.68, 2.3); g.add(l);
    });

    // wheels
    const wDefs = [[-1.08, 0.4, 1.4], [1.08, 0.4, 1.4], [-1.08, 0.4, -1.5], [1.08, 0.4, -1.5]];
    const wheels = [];
    wDefs.forEach(([wx, wy, wz]) => {
        const wg = new THREE.Group();
        wg.position.set(wx, wy, wz);
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14), rubber);
        tire.rotation.z = Math.PI / 2; wg.add(tire);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.33, 10), metal);
        rim.rotation.z = Math.PI / 2; wg.add(rim);
        g.add(wg);
        wheels.push({ group: wg, isFront: wz > 0, side: Math.sign(wx) });
    });

    g.userData.wheels = wheels;
    return g;
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  ENVIRONMENT — CYBERPUNK NIGHT CITY
// ═══════════════════════════════════════════════════════════════
function buildEnvironment() {

    // Deep night sky
    scene.background = new THREE.Color(0x050810);

    // Dense night fog — hides edge of world but still shows city
    scene.fog = new THREE.FogExp2(0x060912, 0.006);

    // Strong ambient — must be high enough to show GLB textures
    const amb = new THREE.AmbientLight(0x6688cc, 3.8);
    scene.add(amb);

    // Moonlight — cool directional, strong
    const moon = new THREE.DirectionalLight(0xaabbdd, 3.5);
    moon.position.set(40, 120, -60);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 500;
    moon.shadow.camera.left = -200;
    moon.shadow.camera.right = 200;
    moon.shadow.camera.top = 200;
    moon.shadow.camera.bottom = -200;
    moon.shadow.bias = -0.0003;
    scene.add(moon);

    // Warm city bounce — orange under-fill
    const hemi = new THREE.HemisphereLight(0x223366, 0xff6600, 0.7);
    scene.add(hemi);

    // Neon street point lights
    [
        { c: 0xff003c, p: [20, 8, 30] },
        { c: 0x00ffcc, p: [-25, 8, 20] },
        { c: 0xff8800, p: [40, 8, -20] },
        { c: 0x9900ff, p: [-40, 8, -30] },
        { c: 0x00aaff, p: [0, 8, -50] },
        { c: 0xff0088, p: [-60, 8, 10] },
        { c: 0xffcc00, p: [60, 8, 10] },
    ].forEach(({ c, p }) => {
        const pl = new THREE.PointLight(c, 4.5, 70, 1.6);
        pl.position.set(...p);
        scene.add(pl);
    });

    // ── BOUNDED GROUND — expanded to 500 for full city coverage
    const geoSize = 500;
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x0d1117,
        roughness: 0.95,
        metalness: 0.08,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(geoSize, geoSize), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    scene.add(ground);

    // Reflective wet overlay
    const wetMat = new THREE.MeshStandardMaterial({
        color: 0x1a2535,
        roughness: 0.04,
        metalness: 0.55,
        transparent: true,
        opacity: 0.4,
    });
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(geoSize, geoSize), wetMat);
    wet.rotation.x = -Math.PI / 2;
    wet.position.y = -0.04;
    wet.name = 'wet_overlay'; // tag it so we can find it to add envMap later
    scene.add(wet);

    // ── MAP BORDERS — preventing falling into void
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 });
    const bSize = geoSize;
    const bThickness = 1;
    const bHeight = 15;

    [
        [0, bHeight / 2, bSize / 2], [0, bHeight / 2, -bSize / 2],
        [bSize / 2, bHeight / 2, 0], [-bSize / 2, bHeight / 2, 0]
    ].forEach(([px, py, pz]) => {
        const isZ = pz !== 0;
        const b = new THREE.Mesh(
            new THREE.BoxGeometry(isZ ? bSize : bThickness, bHeight, isZ ? bThickness : bSize),
            borderMat
        );
        b.position.set(px, py, pz);
        scene.add(b);
        collidables.push(b); // Make border collidable
    });

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) {
        const r = 500 + Math.random() * 300;
        const t = Math.random() * Math.PI * 2;
        const p = Math.random() * Math.PI * 0.45;
        sp[i * 3] = r * Math.sin(p) * Math.cos(t);
        sp[i * 3 + 1] = r * Math.cos(p) + 60;
        sp[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.75 })
    ));
}

// ═══════════════════════════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════════════════════════
const speedCanvas = document.getElementById('speed-canvas');
const compassCanvas = document.getElementById('compass-canvas');
const speedCtx = speedCanvas.getContext('2d');
const compassCtx = compassCanvas.getContext('2d');
const gearEl = document.getElementById('gear-value');
const coordsEl = document.getElementById('coords');
const boostFillEl = document.getElementById('boost-fill');
const engineFillEl = document.getElementById('engine-fill');
const nitroFlashEl = document.getElementById('nitro-flash');
let engineTemp = 20;

function drawSpeedometer(kmh) {
    const W = 160, H = 160, cx = 80, cy = 80, R = 66;
    const pct = Math.min(kmh / 160, 1);
    speedCtx.clearRect(0, 0, W, H);

    // bg
    speedCtx.beginPath(); speedCtx.arc(cx, cy, R, 0, Math.PI * 2);
    speedCtx.fillStyle = 'rgba(0,0,0,0.82)'; speedCtx.fill();

    // track
    const sa = -Math.PI * 0.75, ea_full = Math.PI * 0.75;
    speedCtx.beginPath(); speedCtx.arc(cx, cy, R - 6, sa, sa + Math.PI * 1.5);
    speedCtx.strokeStyle = 'rgba(255,255,255,0.06)'; speedCtx.lineWidth = 10; speedCtx.lineCap = 'round'; speedCtx.stroke();

    // colored arc
    const ea = sa + pct * Math.PI * 1.5;
    const gr = speedCtx.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#00ffcc'); gr.addColorStop(0.6, '#00ccff'); gr.addColorStop(1, kmh > 120 ? '#ff4400' : '#9955ff');
    speedCtx.beginPath(); speedCtx.arc(cx, cy, R - 6, sa, ea);
    speedCtx.strokeStyle = gr; speedCtx.lineWidth = 10; speedCtx.lineCap = 'round'; speedCtx.stroke();

    // ticks
    for (let i = 0; i <= 16; i++) {
        const a = sa + (i / 16) * Math.PI * 1.5;
        const r1 = (i % 4 === 0) ? R - 19 : R - 15;
        speedCtx.beginPath();
        speedCtx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        speedCtx.lineTo(cx + Math.cos(a) * (R - 9), cy + Math.sin(a) * (R - 9));
        speedCtx.strokeStyle = i % 4 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)';
        speedCtx.lineWidth = i % 4 === 0 ? 1.5 : 1; speedCtx.stroke();
    }

    // needle
    const na = sa + pct * Math.PI * 1.5;
    speedCtx.save(); speedCtx.translate(cx, cy); speedCtx.rotate(na);
    speedCtx.beginPath(); speedCtx.moveTo(-2, 6); speedCtx.lineTo(0, -(R - 17)); speedCtx.lineTo(2, 6);
    speedCtx.fillStyle = '#00ffcc'; speedCtx.shadowColor = '#00ffcc'; speedCtx.shadowBlur = 12; speedCtx.fill();
    speedCtx.restore(); speedCtx.shadowBlur = 0;

    // center dot
    speedCtx.beginPath(); speedCtx.arc(cx, cy, 5, 0, Math.PI * 2);
    speedCtx.fillStyle = '#00ffcc'; speedCtx.shadowColor = '#00ffcc'; speedCtx.shadowBlur = 14; speedCtx.fill();
    speedCtx.shadowBlur = 0;
}

function drawCompass(yaw) {
    const W = 70, H = 70, cx = 35, cy = 35, R = 29;
    compassCtx.clearRect(0, 0, W, H);
    compassCtx.beginPath(); compassCtx.arc(cx, cy, R, 0, Math.PI * 2);
    compassCtx.fillStyle = 'rgba(0,0,0,0.78)'; compassCtx.fill();
    compassCtx.strokeStyle = 'rgba(255,255,255,0.08)'; compassCtx.lineWidth = 1; compassCtx.stroke();

    [['N', -yaw], ['E', -yaw + Math.PI / 2], ['S', -yaw + Math.PI], ['W', -yaw - Math.PI / 2]].forEach(([l, a]) => {
        const tx = cx + Math.sin(a) * (R - 9), ty = cy - Math.cos(a) * (R - 9);
        compassCtx.font = 'bold 7px monospace'; compassCtx.textAlign = 'center'; compassCtx.textBaseline = 'middle';
        compassCtx.fillStyle = l === 'N' ? '#ff3333' : 'rgba(255,255,255,0.45)';
        compassCtx.fillText(l, tx, ty);
    });

    compassCtx.save(); compassCtx.translate(cx, cy); compassCtx.rotate(-yaw);
    compassCtx.beginPath(); compassCtx.moveTo(0, -(R - 13)); compassCtx.lineTo(-3, 2); compassCtx.lineTo(0, 6); compassCtx.lineTo(3, 2);
    compassCtx.closePath(); compassCtx.fillStyle = '#ff3333'; compassCtx.fill();
    compassCtx.beginPath(); compassCtx.moveTo(0, (R - 13)); compassCtx.lineTo(-3, -2); compassCtx.lineTo(0, -6); compassCtx.lineTo(3, -2);
    compassCtx.closePath(); compassCtx.fillStyle = 'rgba(255,255,255,0.35)'; compassCtx.fill();
    compassCtx.restore();
    compassCtx.beginPath(); compassCtx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    compassCtx.fillStyle = '#fff'; compassCtx.fill();
}

function updateHUD(speed, yaw, pos) {
    const kmh = Math.abs(speed) * 3.6;
    drawSpeedometer(kmh);
    drawCompass(yaw);

    document.getElementById('speed-value').textContent = Math.round(kmh);

    let gear = 'N';
    if (speed > 0.5) { if (kmh < 20) gear = '1'; else if (kmh < 42) gear = '2'; else if (kmh < 75) gear = '3'; else gear = '4'; }
    else if (speed < -0.3) gear = 'R';
    gearEl.textContent = gear;

    coordsEl.textContent = `X:${pos.x.toFixed(0)} Z:${pos.z.toFixed(0)} Y:${pos.y.toFixed(1)}`;

    const throttle = keys['w'] || keys['arrowup'];
    engineTemp = throttle ? Math.min(100, engineTemp + 12 * 0.016) : Math.max(20, engineTemp - 7 * 0.016);
    engineFillEl.style.width = engineTemp + '%';
    engineFillEl.style.background = engineTemp > 80
        ? 'linear-gradient(90deg,#ef4444,#ff2200)'
        : 'linear-gradient(90deg,#f87171,#fbbf24)';
}

// ═══════════════════════════════════════════════════════════════
//  CAMERA
// ═══════════════════════════════════════════════════════════════
function updateCamera(dt) {
    const pos = carRoot.position;
    const yaw = carRoot.rotation.y;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);

    if (cameraMode === 0) {
        // Chase cam — smooth follow
        const DIST = 14, HEIGHT = 6;
        const idealX = pos.x - sy * DIST;
        const idealY = pos.y + HEIGHT;
        const idealZ = pos.z - cy * DIST;
        camPos.x += (idealX - camPos.x) * (1 - Math.exp(-8 * dt));
        camPos.y += (idealY - camPos.y) * (1 - Math.exp(-7 * dt));
        camPos.z += (idealZ - camPos.z) * (1 - Math.exp(-8 * dt));
        camera.position.copy(camPos);

        const lx = pos.x + sy * 4, ly = pos.y + 1.5, lz = pos.z + cy * 4;
        camLook.x += (lx - camLook.x) * (1 - Math.exp(-12 * dt));
        camLook.y += (ly - camLook.y) * (1 - Math.exp(-12 * dt));
        camLook.z += (lz - camLook.z) * (1 - Math.exp(-12 * dt));
        camera.lookAt(camLook);

    } else if (cameraMode === 1) {
        // Cockpit
        camera.position.set(pos.x + sy * 0.2, pos.y + 1.8, pos.z + cy * 0.2);
        camera.lookAt(pos.x + sy * 20, pos.y + 1.6, pos.z + cy * 20);

    } else {
        // Orbit — right-click drag
        if (mouseDX !== 0 || mouseDY !== 0) {
            camYaw += mouseDX * 0.004;
            camPitch = THREE.MathUtils.clamp(camPitch - mouseDY * 0.003, 0.06, 1.5);
        }
        const r = 20;
        camera.position.set(
            pos.x + r * Math.sin(camYaw) * Math.cos(camPitch),
            pos.y + r * Math.sin(camPitch),
            pos.z + r * Math.cos(camYaw) * Math.cos(camPitch)
        );
        camera.lookAt(pos.x, pos.y + 1, pos.z);
    }
}

// ═══════════════════════════════════════════════════════════════
//  PARTICLES
// ═══════════════════════════════════════════════════════════════
function makeParticles(n, color, size) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3).fill(0);
    for (let i = 0; i < n; i++) arr[i * 3 + 1] = -9999;
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        color, size, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true
    }));
    scene.add(pts);
    return pts;
}

const exhaust = makeParticles(50, 0x888888, 0.3);
const dust = makeParticles(70, 0xbb9955, 0.5);
const exLife = new Float32Array(50), exVel = [];
const duLife = new Float32Array(70), duVel = [];
for (let i = 0; i < 50; i++) exVel.push(new THREE.Vector3());
for (let i = 0; i < 70; i++) duVel.push(new THREE.Vector3());
let exIdx = 0, duIdx = 0;

function updateParticles(dt, pos, yaw, speed) {
    const eP = exhaust.geometry.attributes.position;
    const dP = dust.geometry.attributes.position;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);

    if (Math.abs(speed) > 0.3) {
        eP.setXYZ(exIdx, pos.x - sy * 2.2, pos.y + 0.35, pos.z - cy * 2.2);
        exLife[exIdx] = 1;
        exVel[exIdx].set((Math.random() - .5) * .4, .15 + Math.random() * .25, (Math.random() - .5) * .4);
        exIdx = (exIdx + 1) % 50;

        if (Math.abs(speed) > 1) {
            dP.setXYZ(duIdx, pos.x + (Math.random() - .5) * 1.8, pos.y + .05, pos.z + (Math.random() - .5) * 1.8);
            duLife[duIdx] = 1;
            duVel[duIdx].set((Math.random() - .5) * 2, Math.random() * .8, (Math.random() - .5) * 2);
            duIdx = (duIdx + 1) % 70;
        }
    }

    for (let i = 0; i < 50; i++) {
        if (exLife[i] > 0) {
            exLife[i] -= dt * 1.3;
            eP.setXYZ(i, eP.getX(i) + exVel[i].x * dt, eP.getY(i) + exVel[i].y * dt, eP.getZ(i) + exVel[i].z * dt);
        } else eP.setXYZ(i, 0, -9999, 0);
    }
    for (let i = 0; i < 70; i++) {
        if (duLife[i] > 0) {
            duLife[i] -= dt * 2;
            dP.setXYZ(i, dP.getX(i) + duVel[i].x * dt, dP.getY(i) + duVel[i].y * dt, dP.getZ(i) + duVel[i].z * dt);
        } else dP.setXYZ(i, 0, -9999, 0);
    }
    exhaust.geometry.attributes.position.needsUpdate = true;
    dust.geometry.attributes.position.needsUpdate = true;
}

// ═══════════════════════════════════════════════════════════════
//  LOADING HELPERS
// ═══════════════════════════════════════════════════════════════
const loadBarEl = document.getElementById('loading-bar-fill');
const loadStatEl = document.getElementById('loading-status');
const loadingEl = document.getElementById('loading');
const hudEl = document.getElementById('hud');

function setProgress(pct, msg) {
    loadBarEl.style.width = pct + '%';
    loadStatEl.textContent = msg;
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
    setProgress(5, 'BUILDING SCENE...');
    buildEnvironment();

    // ── DRACO loader for city (may be Draco-compressed)
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    const cityLoader = new GLTFLoader();
    cityLoader.setDRACOLoader(draco);

    // ── Separate plain loader for M3A1 (no Draco, preserves textures)
    const carLoader = new GLTFLoader();
    // Note: no DRACOLoader — avoids any decompression issues with textures

    // ════════════════════════════════════════════════════════════
    // 1. LOAD HONG KONG CITY
    // ════════════════════════════════════════════════════════════
    setProgress(10, 'LOADING HONG KONG CITY...');
    try {
        const cityGltf = await new Promise((res, rej) => cityLoader.load(
            '/models/full_gameready_city_buildings_iv_hongkong.glb', res,
            e => e.total && setProgress(10 + (e.loaded / e.total) * 50, `CITY ${Math.round(e.loaded / e.total * 100)}%`),
            rej
        ));

        const city = cityGltf.scene;

        // Enable shadows + boost emissive window lights
        city.traverse(c => {
            if (!c.isMesh) return;
            c.castShadow = true;
            c.receiveShadow = true;
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => {
                if (m.emissiveIntensity > 0) m.emissiveIntensity *= 1.5;
            });
        });

        // Scale to target width
        const rawBox = new THREE.Box3().setFromObject(city);
        const rawSize = rawBox.getSize(new THREE.Vector3());
        const TARGET = 350;
        const sc = TARGET / Math.max(rawSize.x, rawSize.z);
        city.scale.setScalar(sc);

        // After scale: center X/Z, sit bottom at Y=0
        const scaledBox = new THREE.Box3().setFromObject(city);
        city.position.set(
            -scaledBox.getCenter(new THREE.Vector3()).x,
            -scaledBox.min.y,
            -scaledBox.getCenter(new THREE.Vector3()).z
        );

        // ── Fix floating props: hide any mesh above 60 world units
        //    or whose world-space center is far outside the city footprint
        const cityFootprint = 200; // half-width in world units
        const maxHeight = 55;  // world units — reasonable for buildings
        scene.add(city);           // add first so world transforms are valid
        city.traverse(c => {
            if (!c.isMesh) return;
            const wb = new THREE.Box3().setFromObject(c);
            const wc = wb.getCenter(new THREE.Vector3());
            if (wc.y > maxHeight ||
                Math.abs(wc.x) > cityFootprint ||
                Math.abs(wc.z) > cityFootprint) {
                c.visible = false;  // hide outlier props
            }
        });

        // Collect visible city meshes for collision detection
        // Pre-compute bounding spheres so spatial filter is fast
        city.traverse(c => {
            if (!c.isMesh || !c.visible) return;
            if (!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
            collidables.push(c);
        });
        console.log(`HK City: ${collidables.length} collidable meshes, scale=${sc.toFixed(2)}`);
        setProgress(62, 'CITY LOADED ✓');

    } catch (err) {
        console.warn('City load failed:', err.message);
        setProgress(62, 'CITY LOAD FAILED');
    }

    // ════════════════════════════════════════════════════════════
    // 2. LOAD CAR (car.glb)
    // ════════════════════════════════════════════════════════════
    setProgress(65, 'LOADING VEHICLE...');
    let vehicleLoaded = false;
    try {
        console.log('Loading: /models/car.glb');
        const gltf = await new Promise((res, rej) => carLoader.load(
            '/models/car.glb', res,
            e => e.total && setProgress(65 + (e.loaded / e.total) * 22, `CAR ${Math.round(e.loaded / e.total * 100)}%`),
            err => { console.error('GLB error:', err); rej(err); }
        ));
        const model = gltf.scene;

        // Enable shadows, fix texture colorspace — do NOT replace materials
        // (replacing destroys KHR_materials_pbrSpecularGlossiness textures)
        model.traverse(c => {
            if (!c.isMesh) return;
            c.castShadow = true;
            c.receiveShadow = true;
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => {
                // Fix sRGB color space for all texture maps
                ['map', 'emissiveMap', 'specularMap', 'glossinessMap'].forEach(key => {
                    if (m[key]) {
                        m[key].colorSpace = THREE.SRGBColorSpace;
                        m[key].needsUpdate = true;
                    }
                });
                // Bump up emissive slightly so headlights/windows glow
                if (m.emissive && m.emissiveIntensity > 0) {
                    m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.5);
                }
                // --- PRO ULTRA REFLECTIVE PAINT ---
                m.metalness = 1.0;
                m.roughness = 0.02;
                m.needsUpdate = true;
            });
        });

        // Normalize size to ~4.5 world units wide
        const mb = new THREE.Box3().setFromObject(model);
        const ms = mb.getSize(new THREE.Vector3());
        const mc = mb.getCenter(new THREE.Vector3());
        const msc = 4.5 / Math.max(ms.x, ms.y, ms.z);
        model.scale.setScalar(msc);
        // Center model: offset so car centre is at carRoot origin
        model.position.set(-mc.x * msc, -mb.min.y * msc, -mc.z * msc);

        carRoot.add(model);
        vehicleLoaded = true;

        // ── Real-time environment reflection ─────────────────────
        // CubeRenderTarget: 128 for MAX speed and smooth loading
        cubeRenderTarget = new THREE.WebGLCubeRenderTarget(128, {
            type: THREE.HalfFloatType,
            generateMipmaps: true,
        });
        envCubeCamera = new THREE.CubeCamera(0.5, 300, cubeRenderTarget);
        scene.add(envCubeCamera);

        // Force IMMEDIATE update so first frame isn't black
        envCubeCamera.position.copy(carRoot.position);
        envCubeCamera.position.y += 1;
        envCubeCamera.update(renderer, scene);

        // Apply env map to all car meshes — gives reflections of city/neon
        model.traverse(c => {
            if (!c.isMesh) return;
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => {
                m.envMap = cubeRenderTarget.texture;
                m.envMapIntensity = 6.5;   // pro ultra reflections
                m.needsUpdate = true;
            });
        });

        // Apply reflections to the ROAD too for "Pro" look
        const roadOverlay = scene.getObjectByName('wet_overlay');
        if (roadOverlay) {
            roadOverlay.material.envMap = cubeRenderTarget.texture;
            roadOverlay.material.envMapIntensity = 2.5;
            roadOverlay.material.needsUpdate = true;
        }

        setProgress(88, 'CAR LOADED ✓');
        console.log(`Car loaded: ${ms.x.toFixed(2)}x${ms.y.toFixed(2)}x${ms.z.toFixed(2)}, scale=${msc.toFixed(3)}`);

    } catch (e) {
        console.warn('Vehicle GLB failed:', e);
        const box = buildBoxCar();
        carWheels = box.userData.wheels || [];
        carRoot.add(box);
        setProgress(88, 'BOX CAR (GLB FALLBACK)');
    }

    // ── Add car to scene — spawn at the position shown (X:17 Z:40) facing buildings (180 deg)
    scene.add(carRoot);
    carRoot.position.set(17, 0.1, 40);
    carRoot.rotation.y = Math.PI;

    // Init camPos behind car
    const sy0 = Math.sin(carRoot.rotation.y), cy0 = Math.cos(carRoot.rotation.y);
    camPos.set(
        carRoot.position.x - sy0 * 14,
        carRoot.position.y + 6,
        carRoot.position.z - cy0 * 14
    );
    camLook.copy(carRoot.position);
    camera.position.copy(camPos);

    // ── Headlights
    const hL = new THREE.SpotLight(0xfff5dd, 3.5, 45, Math.PI / 9, 0.4);
    const hR = new THREE.SpotLight(0xfff5dd, 3.5, 45, Math.PI / 9, 0.4);
    hL.position.set(-0.65, 0.65, 2.2);
    hR.position.set(0.65, 0.65, 2.2);
    const tL = new THREE.Object3D(); tL.position.set(-0.65, 0.3, 16);
    const tR = new THREE.Object3D(); tR.position.set(0.65, 0.3, 16);
    carRoot.add(hL, hR, tL, tR);
    hL.target = tL; hR.target = tR;

    const glow = new THREE.PointLight(0x00ffcc, 1.2, 6, 2);
    glow.position.set(0, -0.15, 0);
    carRoot.add(glow);

    // ── Show game
    setProgress(100, vehicleLoaded ? 'M3A1 READY — PRESS W TO DRIVE!' : 'BOX CAR READY — PRESS W TO DRIVE!');
    await new Promise(r => setTimeout(r, 600));
    loadingEl.style.transition = 'opacity 0.8s';
    loadingEl.style.opacity = '0';
    setTimeout(() => { loadingEl.style.display = 'none'; }, 800);
    hudEl.style.opacity = '1';

    animate();
}

// ═══════════════════════════════════════════════════════════════
//  COLLISION DETECTION
// ═══════════════════════════════════════════════════════════════
const _colRaycaster = new THREE.Raycaster();
const CAR_RADIUS = 2.2;   // tighter radius for "real touching" feel

function checkCollisions() {
    if (collidables.length === 0) return false;

    // Spatial filter: recompute neighbours every 30 frames (or if first frame)
    if (frameCount % 30 === 0 || collisionNearby.length === 0) {
        collisionNearby = collidables.filter(c => {
            _cvTmp.setFromMatrixPosition(c.matrixWorld);
            return _cvTmp.distanceTo(carRoot.position) < 60; // Larger radius for more reliability
        });
    }
    if (collisionNearby.length === 0) return;

    // Optimized 2-Layer Scanning: Center and Front (Saves 50% CPU)
    const heights = [0.5, 1.5];
    const origins = [];
    const yaw = carRoot.rotation.y;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);

    heights.forEach(h => {
        origins.push(carRoot.position.clone().add(new THREE.Vector3(0, h, 0))); // center
        origins.push(carRoot.position.clone().add(new THREE.Vector3(sy * 1.8, h, cy * 1.8))); // front
    });

    const angles = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4];
    _colRaycaster.far = CAR_RADIUS + 0.4;

    _colRaycaster.far = CAR_RADIUS + 0.8;
    _colRaycaster.near = 0;

    let totalPushX = 0, totalPushZ = 0;
    let collided = false;

    origins.forEach(origin => {
        for (const a of angles) {
            const dx = Math.sin(yaw + a);
            const dz = Math.cos(yaw + a);
            _colRaycaster.set(origin, _cvTmp.set(dx, 0, dz).normalize());

            const hits = _colRaycaster.intersectObjects(collisionNearby, false);
            if (hits.length === 0 || hits[0].distance >= CAR_RADIUS) continue;

            const hit = hits[0];
            const dist = hit.distance;
            const pen = CAR_RADIUS - dist;

            let normal;
            if (hit.face && hit.face.normal) {
                normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
                normal.y = 0;
                // --- PRO CORRECTION: Ensure normal pushes AWAY from collision point ---
                if (normal.dot(_cvTmp.set(dx, 0, dz)) > 0) normal.negate();
                normal.normalize();
            } else {
                normal = new THREE.Vector3(-dx, 0, -dz);
            }

            // Super-Expulsion Force
            const force = 1.35;
            totalPushX += normal.x * pen * force;
            totalPushZ += normal.z * pen * force;

            // Reflect velocity with restitution
            const dot = carVel.x * normal.x + carVel.z * normal.z;
            if (dot < 0) {
                carVel.x -= (1 + 0.35) * dot * normal.x;
                carVel.z -= (1 + 0.35) * dot * normal.z;
                carSpeed *= 0.25;
                collided = true;
            }
        }
    });

    if (collided) {
        // Apply cumulative expulsion
        carRoot.position.x += totalPushX;
        carRoot.position.z += totalPushZ;

        // Force Stop if hit too hard
        if (Math.abs(totalPushX) > 0.1 || Math.abs(totalPushZ) > 0.1) {
            carSpeed *= 0.5;
            carVel.multiplyScalar(0.7);
        }

        const now = Date.now();
        if (now - lastCollisionTime > 180) {
            lastCollisionTime = now;
            const impact = Math.min(Math.abs(carSpeed) / MAX_SPEED, 1);
            screenShakeAmt = impact * 1.8; // increased for more drama
            playCollisionSound(impact);

            // Visual Flash (Accident)
            document.body.classList.add('accident-blur');
            const flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,0,0,0.45);pointer-events:none;z-index:9999;animation:crashFlash 0.4s forwards;';
            document.body.appendChild(flash);
            setTimeout(() => {
                flash.remove();
                document.body.classList.remove('accident-blur');
            }, 450);
        }
    }
    return collided;
}

function playCollisionSound(intensity = 0.5) {
    if (!audioCtx || soundMuted) return;
    // Short burst of filtered noise = metal thud
    const len = Math.floor(audioCtx.sampleRate * 0.18);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    const decay = audioCtx.sampleRate * 0.06;
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / decay);

    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const lpf = audioCtx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 350 + intensity * 300;
    const g = audioCtx.createGain();
    g.gain.value = 0.55 * intensity;
    src.connect(lpf); lpf.connect(g); g.connect(audioCtx.destination);
    src.start(); src.stop(audioCtx.currentTime + 0.2);
}

// ═══════════════════════════════════════════════════════════════
//  ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    // ── Read keys ──────────────────────────────────────────
    const goFwd = keys['w'] || keys['arrowup'];
    const goBack = keys['s'] || keys['arrowdown'];
    const goLeft = keys['a'] || keys['arrowleft'];
    const goRight = keys['d'] || keys['arrowright'];
    const boosting = (keys['shift'] || keys['shiftleft']) && boostFuel > 0;
    const handbrake = keys[' '];

    // Camera switch (C, one-shot)
    const cNow = keys['c'];
    if (cNow && !camSwitchedLastFrame) cameraMode = (cameraMode + 1) % 3;
    camSwitchedLastFrame = cNow;

    // Reset (R, one-shot)
    const rNow = keys['r'];
    if (rNow && !resetPressedLastFrame) {
        carRoot.position.set(17, 0.1, 40);   // reset to the specified street point
        carRoot.rotation.set(0, Math.PI, 0); // rotated 180 deg to face buildings
        carSpeed = 0; carSteer = 0; boostFuel = 100;
        carVel.set(0, 0, 0);
        driftFactor = 0;
    }
    resetPressedLastFrame = rNow;

    // ── STEERING (FIXED: A=left, D=right from driver view) ───
    // Positive steer = CCW yaw = left turn from driver's perspective (camera behind)
    const steerTarget = goLeft ? MAX_STEER : goRight ? -MAX_STEER : 0;
    carSteer += (steerTarget - carSteer) * Math.min(dt * STEER_RATE, 1);

    // ── SPEED ──────────────────────────────────────────────
    const topSpd = boosting ? BOOST_SPEED : MAX_SPEED;
    if (goFwd) {
        carSpeed = Math.min(carSpeed + (boosting ? ACCEL * 1.8 : ACCEL) * dt, topSpd);
    } else if (goBack) {
        if (carSpeed > 0.5) carSpeed -= BRAKE_FORCE * dt;
        else carSpeed = Math.max(carSpeed - REV_SPEED * dt, -REV_SPEED);
    } else {
        carSpeed *= Math.pow(0.88, dt * 60); // natural friction
    }
    if (Math.abs(carSpeed) < 0.02) carSpeed = 0;

    // ── YAW (speed-dependent turn radius) ──────────────────
    const speedPct = Math.min(Math.abs(carSpeed), MAX_SPEED) / MAX_SPEED;
    if (Math.abs(carSpeed) > 0.1) {
        const turnRate = carSteer * speedPct * 2.8 * Math.sign(carSpeed);
        carRoot.rotation.y += turnRate * dt;
    }

    // ── DRIFT PHYSICS ──────────────────────────────────────
    const sy = Math.sin(carRoot.rotation.y);
    const cy = Math.cos(carRoot.rotation.y);
    const carFwdX = sy, carFwdZ = cy;

    // Desired velocity: along car's facing direction
    const desiredVX = carFwdX * carSpeed;
    const desiredVZ = carFwdZ * carSpeed;

    // Handbrake = initiate drift (low rear grip)
    isDrifting = handbrake && Math.abs(carSpeed) > 3;
    const gripStrength = isDrifting ? 0.04 : (boosting ? 0.25 : 0.45);
    const driftDecay = isDrifting ? 0.92 : 0.78;

    // Blend actual velocity toward desired (lower blend = more drift/slide)
    carVel.x += (desiredVX - carVel.x) * gripStrength;
    carVel.z += (desiredVZ - carVel.z) * gripStrength;
    // Apply slight damping
    carVel.x *= driftDecay + (1 - driftDecay) * (1 - dt * 20);
    carVel.z *= driftDecay + (1 - driftDecay) * (1 - dt * 20);
    // Clamp magnitude to top speed
    const velMag = Math.sqrt(carVel.x * carVel.x + carVel.z * carVel.z);
    if (velMag > topSpd) { carVel.x *= topSpd / velMag; carVel.z *= topSpd / velMag; }

    // ── SUB-STEPPING MOVEMENT (OPTIMIZED ACCURACY) ────────
    const steps = 2; // Perfectly smooth even at top speed
    const sDt = dt / steps;
    let hitAny = false;

    for (let i = 0; i < steps; i++) {
        carRoot.position.x += carVel.x * sDt;
        carRoot.position.z += carVel.z * sDt;
        if (checkCollisions()) hitAny = true;
        carRoot.position.x = THREE.MathUtils.clamp(carRoot.position.x, -137, 137);
        carRoot.position.z = THREE.MathUtils.clamp(carRoot.position.z, -137, 137);
    }

    // Emergency Stuck Warp: if stuck in red zone for > 1.5s
    if (hitAny && Math.abs(carSpeed) < 1) {
        stuckTimer += dt;
        if (stuckTimer > 1.5) {
            carRoot.position.set(35, 0.1, 65); // Warp to safe street
            stuckTimer = 0;
        }
    } else {
        stuckTimer = 0;
    }

    carRoot.position.y = 0.1;

    // Drift factor for effects
    driftFactor = THREE.MathUtils.lerp(driftFactor, isDrifting ? 1 : 0, dt * 4);

    // ── BOOST ──────────────────────────────────────────────
    if (boosting && Math.abs(carSpeed) > 0.5) {
        boostFuel = Math.max(0, boostFuel - 28 * dt);
        nitroFlashEl.style.opacity = boostFuel > 0 ? '0.5' : '0';
    } else {
        boostFuel = Math.min(100, boostFuel + 16 * dt);
        nitroFlashEl.style.opacity = '0';
    }
    boostFillEl.style.width = boostFuel + '%';

    // ── WHEEL SPIN (box car) ───────────────────────────────
    if (carWheels.length > 0) {
        const angV = carSpeed / 0.42;
        carWheels.forEach(w => {
            w.group.rotation.x += angV * dt;
            if (w.isFront) w.group.rotation.y = -w.side * carSteer; // fixed steer vis
        });
    }

    // ── BODY TILT (including drift lean) ───────────────────
    const driftLean = isDrifting ? carSteer * 0.12 : 0;
    carRoot.rotation.z = THREE.MathUtils.lerp(carRoot.rotation.z,
        carSteer * speedPct * 0.07 + driftLean, 0.12);
    carRoot.rotation.x = THREE.MathUtils.lerp(carRoot.rotation.x,
        (goFwd ? -1 : goBack ? 1 : 0) * speedPct * 0.028, 0.08);

    // ── ENGINE AUDIO ───────────────────────────────────────
    updateAudio(carSpeed, boosting, isDrifting);

    // ── DRIFT INDICATOR ────────────────────────────────────
    if (driftIndicatorEl) {
        driftIndicatorEl.style.opacity = isDrifting ? '1' : '0';
    }

    // ── Particles ──────────────────────────────────────────
    updateParticles(dt, carRoot.position, carRoot.rotation.y, carSpeed);

    // ── Camera ─────────────────────────────────────────────
    updateCamera(dt);

    // ── FRAME COUNTER ───────────────────────────────────────
    frameCount++;

    // ── PRO REAL-TIME REFLECTIONS (Optimized: every 10 frames) ──
    if (envCubeCamera && frameCount % 10 === 0) {
        carRoot.visible = false;            // hide so car doesn't reflect itself
        envCubeCamera.position.copy(carRoot.position);
        envCubeCamera.position.y += 1;
        envCubeCamera.update(renderer, scene);
        carRoot.visible = true;
    }

    // ── COLLISION DETECTION (NOW HANDLED IN SUB-STEPS) ──────
    // checkCollisions();

    // ── SCREEN SHAKE ────────────────────────────────────────
    if (screenShakeAmt > 0.002) {
        camera.position.x += (Math.random() - 0.5) * screenShakeAmt;
        camera.position.y += (Math.random() - 0.5) * screenShakeAmt * 0.4;
        camera.position.z += (Math.random() - 0.5) * screenShakeAmt * 0.15;
        screenShakeAmt *= 0.68;   // exponential decay
    }

    // ── HUD ────────────────────────────────────────────────
    updateHUD(carSpeed, carRoot.rotation.y, carRoot.position);

    mouseDX = 0; mouseDY = 0;
    renderer.render(scene, camera);
}

// ── Resize ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
