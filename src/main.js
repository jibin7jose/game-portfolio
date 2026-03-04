import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { resumeData } from './resume_data.js';

// Removed heavy post-processing imports to fix performance
const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
const lowQuality = isMobileDevice || (navigator.deviceMemory && navigator.deviceMemory <= 4) || Math.min(window.innerWidth, window.innerHeight) < 720;
const MAX_PIXEL_RATIO = lowQuality ? 1.25 : 2;
const REFLECT_EVERY = lowQuality ? 20 : 10;
const BASE_FOG_DENSITY = 0.003;
let mouseSteerSensitivity = 0.012;
const USE_VIDEO_BACKGROUND = true;
const CAR_BODY_COLOR = 0xffd400;
const SHOW_NAME_IN_SPEEDOMETER = true;

// ═══════════════════════════════════════════════════════════════
//  RENDERER
// ═══════════════════════════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ antialias: !lowQuality, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowQuality;
renderer.shadowMap.type = lowQuality ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4; // Pro exposure for vibrant neons
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (USE_VIDEO_BACKGROUND) renderer.setClearColor(0x000000, 0);
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
const BASE_FOV = 60;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 3000);
// Start high up for a dramatic cinematic sweep-in
camera.position.set(0, 80, -100);

let introSweepDone = false;
let sweepTime = 0;

// ═══════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════
const keys = {};
const touchState = {
    steer: 0,
    throttle: false,
    brake: false,
    boost: false,
    handbrake: false,
    camSwitch: false,
    reset: false,
    weather: false,
    mission: false,
    photo: false
};
const gamepadState = {
    steer: 0,
    throttle: 0,
    brake: 0,
    boost: false,
    handbrake: false,
    camSwitch: false,
    reset: false
};
let lastGamepadButtons = [];
let mouseButtons = 0;
let mouseSteer = 0;
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    // only prevent scroll keys
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
    }
    if (e.key === '[') {
        mouseSteerSensitivity = Math.max(0.004, mouseSteerSensitivity - 0.002);
    }
    if (e.key === ']') {
        mouseSteerSensitivity = Math.min(0.03, mouseSteerSensitivity + 0.002);
    }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

let mouseDX = 0, mouseDY = 0;
window.addEventListener('mousedown', e => { mouseButtons = e.buttons; });
window.addEventListener('mouseup', e => { mouseButtons = e.buttons; });
window.addEventListener('mouseleave', () => { mouseButtons = 0; });
window.addEventListener('mousemove', e => {
    if (e.buttons === 2) { mouseDX += e.movementX; mouseDY += e.movementY; }
    if (mouseButtons & 1) {
        mouseSteer = THREE.MathUtils.clamp(mouseSteer + e.movementX * mouseSteerSensitivity, -1, 1);
    }
});
window.addEventListener('contextmenu', e => e.preventDefault());

function setupMobileControls() {
    const joystick = document.getElementById('touch-joystick');
    const knob = joystick ? joystick.querySelector('.stick-knob') : null;
    if (!joystick || !knob) return;

    let active = false;
    let pointerId = null;
    const baseRect = () => joystick.getBoundingClientRect();
    const radius = 46;

    const updateKnob = (dx, dy) => {
        const mag = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(mag, radius);
        const nx = (dx / mag) * clamped;
        const ny = (dy / mag) * clamped;
        knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
        touchState.steer = THREE.MathUtils.clamp(nx / radius, -1, 1);
    };

    const resetKnob = () => {
        knob.style.transform = 'translate(-50%, -50%)';
        touchState.steer = 0;
    };

    joystick.addEventListener('pointerdown', e => {
        initAudio();
        active = true;
        pointerId = e.pointerId;
        joystick.setPointerCapture(pointerId);
        const rect = baseRect();
        updateKnob(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
    });

    joystick.addEventListener('pointermove', e => {
        if (!active || e.pointerId !== pointerId) return;
        const rect = baseRect();
        updateKnob(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
    });

    joystick.addEventListener('pointerup', () => {
        active = false;
        pointerId = null;
        resetKnob();
    });
    joystick.addEventListener('pointercancel', () => {
        active = false;
        pointerId = null;
        resetKnob();
    });

    const holdBtn = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        const down = e => {
            e.preventDefault();
            initAudio();
            touchState[key] = true;
            el.classList.add('active');
        };
        const up = () => {
            touchState[key] = false;
            el.classList.remove('active');
        };
        el.addEventListener('pointerdown', down);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointerleave', up);
        el.addEventListener('pointercancel', up);
    };

    const tapBtn = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('pointerdown', e => {
            e.preventDefault();
            initAudio();
            touchState[key] = true;
            setTimeout(() => { touchState[key] = false; }, 0);
        });
    };

    holdBtn('touch-accel', 'throttle');
    holdBtn('touch-brake', 'brake');
    holdBtn('touch-drift', 'handbrake');
    holdBtn('touch-boost', 'boost');
    tapBtn('touch-camera', 'camSwitch');
    tapBtn('touch-reset', 'reset');
    tapBtn('touch-weather', 'weather');
    tapBtn('touch-mission', 'mission');
    tapBtn('touch-photo', 'photo');
}

function applyDeadzone(v, dz) {
    const a = Math.abs(v);
    if (a < dz) return 0;
    return (v - Math.sign(v) * dz) / (1 - dz);
}

function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads.length ? (pads[0] || pads.find(p => p)) : null;
    if (!pad) {
        gamepadState.steer = 0;
        gamepadState.throttle = 0;
        gamepadState.brake = 0;
        gamepadState.boost = false;
        gamepadState.handbrake = false;
        gamepadState.camSwitch = false;
        gamepadState.reset = false;
        lastGamepadButtons = [];
        return;
    }

    const lx = applyDeadzone(pad.axes[0] || 0, 0.18);
    gamepadState.steer = THREE.MathUtils.clamp(lx, -1, 1);

    const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
    const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
    gamepadState.throttle = Math.min(Math.max(rt, 0), 1);
    gamepadState.brake = Math.min(Math.max(lt, 0), 1);

    const aBtn = pad.buttons[0] && pad.buttons[0].pressed;
    const bBtn = pad.buttons[1] && pad.buttons[1].pressed;
    const xBtn = pad.buttons[2] && pad.buttons[2].pressed;
    const yBtn = pad.buttons[3] && pad.buttons[3].pressed;

    gamepadState.handbrake = !!aBtn;
    gamepadState.boost = !!bBtn;
    gamepadState.camSwitch = !!yBtn && !lastGamepadButtons[3];
    gamepadState.reset = !!xBtn && !lastGamepadButtons[2];

    lastGamepadButtons = [
        pad.buttons[0] && pad.buttons[0].pressed,
        pad.buttons[1] && pad.buttons[1].pressed,
        pad.buttons[2] && pad.buttons[2].pressed,
        pad.buttons[3] && pad.buttons[3].pressed
    ];
}

setupMobileControls();

// ═══════════════════════════════════════════════════════════════
//  PHYSICS CONSTANTS
// ═══════════════════════════════════════════════════════════════
const MAX_SPEED = 62;
const BOOST_SPEED = 90;
const ACCEL = 26;
const BRAKE_FORCE = 48;
const REV_SPEED = 12;
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
let throttleInput = 0;
let brakeInput = 0;
let driftScore = 0;
let driftCombo = 0;
let driftBankTimer = 0;
let hudHidden = false;
let pickupMeshes = [];
let pickupCollected = 0;
let pickupTotal = 0;
let speedCameras = [];
let speedFines = 0;
let eventTimer = 0;

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
let isSpinningOut = false;
let spinTimer = 0;
let brakeLightL = null;
let brakeLightR = null;
const lastSafePos = new THREE.Vector3(17, 0.1, 40);
const _cvTmp = new THREE.Vector3();

let cameraMode = 0;   // 0=chase  1=cockpit  2=orbit  3=drone
let camYaw = 0;
let camPitch = 0.35;
let speedLines = null;
let speedLineOffsets = null;
let trailPoints = null;
let trailPositions = null;
let trailIndex = 0;
let underglow = null;
let underglowOn = true;
let boostShockwaves = [];
let boostingLastFrame = false;
let driftSmokePts = null;
let driftSmokeLife = null;
let driftSmokeVel = null;
let driftSmokeIndex = 0;
let snapshotPressedLastFrame = false;
let weatherMode = 0; // 0=clear 1=rain 2=storm
let rainPoints = null;
let rainVel = null;
let lightningLight = null;
let lightningTimer = 0;
let timeOfDay = 0; // 0=night, 1=dawn
let envAmbient = null;
let envMoon = null;
let envHemi = null;
let envNeonLights = [];
let trafficCurve = null;
let trafficCurveLen = 1;
let trafficCars = [];
let missionActive = false;
let missionIndex = 0;
let missionStartTime = 0;
let missionRings = [];
let missionPoints = [
    new THREE.Vector3(40, 0.2, 80),
    new THREE.Vector3(-80, 0.2, 50),
    new THREE.Vector3(-120, 0.2, -60),
    new THREE.Vector3(60, 0.2, -120),
    new THREE.Vector3(120, 0.2, 20)
];
let missionCooldown = 0;
let photoMode = false;
let photoYaw = 0;
let photoPitch = 0.2;
let photoSpeed = 28;
let followSpot = null;
let weatherPressedLastFrame = false;
let missionPressedLastFrame = false;
let photoPressedLastFrame = false;
let hudPressedLastFrame = false;
let timePressedLastFrame = false;
let demoMode = false;
let demoPressedLastFrame = false;
let demoTime = 0;
let glowPressedLastFrame = false;

const camPos = new THREE.Vector3(0, 12, 30);
const camLook = new THREE.Vector3();
let carWheels = [];

let camSwitchedLastFrame = false;
let resetPressedLastFrame = false;

// Resume RECON logic state
let currentActiveResume = null;
let resumeMarkers = [];
const SCAN_RANGE = 12;
const SCAN_READY_RANGE = 20;

// ═══════════════════════════════════════════════════════════════
//  WEB AUDIO — ENGINE SOUND (no files needed)
// ═══════════════════════════════════════════════════════════════
let audioCtx = null, engineGain = null;
let engineSource = null; // High-quality MP3 loop
let engineOscA = null, engineOscB = null, engineOscC = null;
let engineFilter = null;
let driftGain = null;

// New Gear & RPM Logic
let currentGear = 1;
let lastGear = 1;
let engineRPM = 0.2; // 0.2 (idle) to 1.0 (redline)
let currentAudioRPM = 0.2; // smoothed RPM for pitch/logic

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // ── Pre-load High-Quality Racing MP3 ──────────────────
    fetch('models/u_xg7ssi08yr-race-car-362035.mp3')
        .then(r => r.arrayBuffer())
        .then(b => audioCtx.decodeAudioData(b))
        .then(buf => {
            engineSource = audioCtx.createBufferSource();
            engineSource.buffer = buf;
            engineSource.loop = true;
            engineSource.connect(engineGain);
            engineSource.start(0);
            console.log("Pro Racing Sound Loaded ✓");
        }).catch(err => console.warn("MP3 Audio failed, using procedural fallback.", err));

    // ── Procedural Fallback Layer (Oscillators) ───────────
    engineOscA = audioCtx.createOscillator();
    engineOscB = audioCtx.createOscillator();
    engineOscC = audioCtx.createOscillator();

    engineOscA.type = 'sawtooth'; engineOscA.frequency.value = 55;
    engineOscB.type = 'square'; engineOscB.frequency.value = 57;
    engineOscC.type = 'sawtooth'; engineOscC.frequency.value = 27;

    engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineFilter.Q.value = 4.5;

    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0.05;

    engineOscA.connect(engineFilter);
    engineOscB.connect(engineFilter);
    engineOscC.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(audioCtx.destination);

    engineOscA.start(); engineOscB.start(); engineOscC.start();

    // --- Tire screech ---
    const bufLen = audioCtx.sampleRate * 0.4;
    const noiseBuf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuf; noiseNode.loop = true;
    const bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 1600; bpf.Q.value = 3.5;
    driftGain = audioCtx.createGain(); driftGain.gain.value = 0;
    noiseNode.connect(bpf); bpf.connect(driftGain); driftGain.connect(audioCtx.destination);
    noiseNode.start();
}

function updateAudio(speed, boosting, drifting) {
    if (!audioCtx || !engineGain) return;
    const kmh = Math.abs(speed) * 3.6;

    // ── Gear Shifting Logic (High-Speed Calibration) ──
    let targetGear = 1;
    if (kmh < 35) targetGear = 1;
    else if (kmh < 80) targetGear = 2;
    else if (kmh < 140) targetGear = 3;
    else if (kmh < 220) targetGear = 4;
    else targetGear = 5;

    if (kmh < 0.5) targetGear = 1;

    // Gear shift sound trigger
    if (targetGear !== lastGear) {
        playGearShiftSound(targetGear > lastGear ? 'up' : 'down');
        lastGear = targetGear;
    }
    currentGear = targetGear;

    // RPM Calculation: climbs within the gear range
    let rpmBase = 0, rpmMax = 1;
    if (targetGear === 1) { rpmBase = 0; rpmMax = 35; }
    else if (targetGear === 2) { rpmBase = 35; rpmMax = 80; }
    else if (targetGear === 3) { rpmBase = 80; rpmMax = 140; }
    else if (targetGear === 4) { rpmBase = 140; rpmMax = 220; }
    else { rpmBase = 220; rpmMax = 340; }

    let targetRPM = 0.4 + (Math.min(kmh, rpmMax) - rpmBase) / (rpmMax - rpmBase) * 0.6;
    if (kmh < 1) targetRPM = 0.15; // Clean Idle

    // --- ULTRA SMOOTHING: very slowly blend currentAudioRPM toward targetRPM ---
    // Reduced factors to make the transition even longer/slower
    const shiftSmoothing = (targetGear !== lastGear) ? 0.012 : 0.05;
    currentAudioRPM += (targetRPM - currentAudioRPM) * shiftSmoothing;

    // ── MP3 Engine Simulation ──────────────────────────
    if (engineSource) {
        // Significantly lower playbackRate at idle so it doesn't sound "moving"
        // Only blooms into a racing sound when kmh > 1
        const rate = (kmh < 1) ? 0.45 : (0.5 + currentAudioRPM * 2.1 + (boosting ? 0.4 : 0));
        engineSource.playbackRate.setTargetAtTime(rate, audioCtx.currentTime, 0.1);
    }

    // ── Procedural Layer Update ────────────────────────
    if (engineOscA) {
        const freq = (kmh < 1) ? 30 : (40 + currentAudioRPM * 160 + (boosting ? 40 : 0));
        engineOscA.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.08);
        engineOscB.frequency.setTargetAtTime(freq * 1.5, audioCtx.currentTime, 0.08);
        engineOscC.frequency.setTargetAtTime(freq * 0.5, audioCtx.currentTime, 0.08);

        const f = 120 + currentAudioRPM * 1800 + (boosting ? 500 : 0);
        engineFilter.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.12);
    }

    // Volume scaling: distinctly quiet at stop, loud at speed
    const baseVol = (engineSource ? 0.38 : 0.06);
    const movingVol = (kmh < 1) ? 0.22 : (baseVol + (kmh / 160) * 0.15 + (boosting ? 0.1 : 0));
    engineGain.gain.setTargetAtTime(movingVol, audioCtx.currentTime, 0.15);

    // Tyre screech
    const screeVol = drifting ? 0.35 * Math.min(kmh / 40, 1) : 0;
    driftGain.gain.setTargetAtTime(screeVol, audioCtx.currentTime, 0.08);
}

function playGearShiftSound(dir) {
    if (!audioCtx || soundMuted) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(dir === 'up' ? 120 : 80, now);
    osc.frequency.exponentialRampToValueAtTime(10, now + 0.1);
    g.gain.setValueAtTime(0.15, now);
    g.gain.linearRampToValueAtTime(0, now + 0.1);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(); osc.stop(now + 0.1);
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

    const green = new THREE.MeshStandardMaterial({ color: CAR_BODY_COLOR, roughness: 0.45, metalness: 0.7 });
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
    if (!USE_VIDEO_BACKGROUND) {
        scene.background = new THREE.Color(0x050810);
    } else if (cameraMode === 2) {
        scene.background = null;
    }

    // Dense night fog — clear enough to see buildings, thick enough for atmosphere
    scene.fog = new THREE.FogExp2(0x060912, BASE_FOG_DENSITY);

    // Strong ambient — must be high enough to show GLB textures
    const amb = new THREE.AmbientLight(0x6688cc, 3.8);
    envAmbient = amb;
    scene.add(amb);

    // Moonlight — cool directional, strong
    const moon = new THREE.DirectionalLight(0xaabbdd, 3.2);
    moon.position.set(40, 120, -60);
    moon.castShadow = true;
    moon.shadow.mapSize.set(lowQuality ? 1024 : 2048, lowQuality ? 1024 : 2048);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 500;
    moon.shadow.camera.left = -200;
    moon.shadow.camera.right = 200;
    moon.shadow.camera.top = 200;
    moon.shadow.camera.bottom = -200;
    moon.shadow.bias = -0.0003;
    envMoon = moon;
    scene.add(moon);

    // Warm city bounce — orange under-fill
    const hemi = new THREE.HemisphereLight(0x223366, 0xff6600, 0.7);
    envHemi = hemi;
    scene.add(hemi);

    // Follow spotlight to keep the car visually crisp
    followSpot = new THREE.SpotLight(0x66ccff, 1.2, 90, Math.PI / 6, 0.35, 1.1);
    followSpot.castShadow = false;
    followSpot.position.set(0, 18, 0);
    scene.add(followSpot);
    scene.add(followSpot.target);

    // Neon street point lights — duplicated for 4 Tiles
    const lights = [
        { c: 0xff003c, p: [20, 8, 30] },
        { c: 0x00ffcc, p: [-25, 8, 20] },
        { c: 0xff8800, p: [40, 8, -20] },
        { c: 0x9900ff, p: [-40, 8, -30] },
        { c: 0x00aaff, p: [0, 8, -50] },
        { c: 0xff0088, p: [-60, 8, 10] },
        { c: 0xffcc00, p: [60, 8, 10] },
    ];

    const lightIntensity = lowQuality ? 3.2 : 4.5;
    const lightList = lowQuality ? lights.slice(0, 4) : lights;
    [
        { x: -175, z: -175 }, { x: 175, z: -175 },
        { x: -175, z: 175 }, { x: 175, z: 175 }
    ].forEach(off => {
        lightList.forEach(({ c, p }) => {
            const pl = new THREE.PointLight(c, lightIntensity, 70, 1.6);
            pl.position.set(p[0] + off.x, p[1], p[2] + off.z);
            scene.add(pl);
            envNeonLights.push(pl);
        });
    });

    // ── GROUND SYSTEM — Will be filled by loadRoads() GLB tiling
    const geoSize = 720;

    // ── MAP BORDERS — Expanded
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

    // ── VOLUMETRIC ENVIRONMENTAL SMOKE ──
    const smokeCanvas = document.createElement('canvas');
    smokeCanvas.width = 128;
    smokeCanvas.height = 128;
    const sctx = smokeCanvas.getContext('2d');
    const grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.15)'); // Subtle center
    grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);

    const smokeGeo = new THREE.BufferGeometry();
    const smokeCount = lowQuality ? 1200 : 3500; // Balanced coverage
    const smokePositions = new Float32Array(smokeCount * 3);

    for (let i = 0; i < smokeCount; i++) {
        smokePositions[i * 3] = (Math.random() - 0.5) * 1600;      // Mega-city X spread
        smokePositions[i * 3 + 1] = Math.random() * 80 + 5;        // From near-ground (5) to 85 above car
        smokePositions[i * 3 + 2] = (Math.random() - 0.5) * 1600;  // Mega-city Z spread
    }
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));

    const smokeMat = new THREE.PointsMaterial({
        size: 80, // Balanced smoke clouds
        map: new THREE.CanvasTexture(smokeCanvas),
        transparent: true,
        opacity: 0.35, // Subtle atmospheric smoke
        depthWrite: false,
        blending: THREE.NormalBlending,
        color: 0x334a66 // Dark cinematic mist
    });

    const envSmoke = new THREE.Points(smokeGeo, smokeMat);
    scene.add(envSmoke);
    window.envSmoke = envSmoke; // Save for animation loop

    // ── GLOWING NEON GRID FLOOR (SYNTHWAVE VIBE) ──
    const gridHelper = new THREE.GridHelper(1200, 120, 0x00ffcc, 0x004488);
    gridHelper.position.y = -0.02; // Just above road
    gridHelper.material.opacity = 0.5;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Cyber pillars removed based on user feedback

    // ── FLOATING HOLO NODES ──
    const hGeo = new THREE.OctahedronGeometry(2.5, 0);
    const hMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 2, wireframe: true });
    window.holoNodes = [];
    const holoCount = lowQuality ? 22 : 50;
    for (let i = 0; i < holoCount; i++) {
        const h = new THREE.Mesh(hGeo, hMat);
        let hx = (Math.random() - 0.5) * 1000;
        let hz = (Math.random() - 0.5) * 1000;
        h.position.set(hx, 3 + Math.random() * 12, hz);
        scene.add(h);
        window.holoNodes.push(h);
    }

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starCount = lowQuality ? 1200 : 3000;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
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

    // Speed lines (camera-space streaks)
    const lineCount = lowQuality ? 60 : 120;
    const lineGeo = new THREE.BufferGeometry();
    const linePos = new Float32Array(lineCount * 6);
    speedLineOffsets = new Float32Array(lineCount * 3);
    for (let i = 0; i < lineCount; i++) {
        const idx = i * 6;
        const sx = (Math.random() - 0.5) * 2.2;
        const sy = (Math.random() - 0.5) * 1.4;
        const sz = -Math.random() * 8 - 1;
        linePos[idx] = sx; linePos[idx + 1] = sy; linePos[idx + 2] = sz;
        linePos[idx + 3] = sx; linePos[idx + 4] = sy; linePos[idx + 5] = sz - 1.8;
        speedLineOffsets[i * 3] = (Math.random() - 0.5) * 2.2;
        speedLineOffsets[i * 3 + 1] = (Math.random() - 0.5) * 1.4;
        speedLineOffsets[i * 3 + 2] = -Math.random() * 8 - 1;
    }
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.0 });
    speedLines = new THREE.LineSegments(lineGeo, lineMat);
    speedLines.position.z = -2;
    camera.add(speedLines);
    scene.add(camera);
}

function setupWeather() {
    const count = lowQuality ? 1200 : 3800;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    rainVel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 900;
        pos[i * 3 + 1] = Math.random() * 160 + 10;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 900;
        rainVel[i] = 22 + Math.random() * 18;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0x88aaff,
        size: lowQuality ? 0.15 : 0.2,
        transparent: true,
        opacity: 0.65,
        depthWrite: false
    });
    rainPoints = new THREE.Points(geo, mat);
    rainPoints.visible = false;
    scene.add(rainPoints);

    lightningLight = new THREE.PointLight(0xaad4ff, 0, 600, 2);
    lightningLight.position.set(0, 120, 0);
    scene.add(lightningLight);
}

function setWeatherMode(mode) {
    weatherMode = mode;
    if (rainPoints) rainPoints.visible = weatherMode > 0;
    if (scene.fog) {
        const mult = weatherMode === 0 ? 1 : weatherMode === 1 ? 1.6 : 2.2;
        scene.fog.density = BASE_FOG_DENSITY * mult;
    }
    const roadOverlay = scene.getObjectByName('wet_overlay');
    if (roadOverlay && roadOverlay.material) {
        roadOverlay.material.opacity = weatherMode === 0 ? 0.12 : weatherMode === 1 ? 0.32 : 0.45;
        roadOverlay.material.needsUpdate = true;
    }
}

function setTimeOfDay(mode) {
    timeOfDay = mode;
    if (timeOfDay === 0) {
        if (!USE_VIDEO_BACKGROUND) scene.background = new THREE.Color(0x050810);
        if (scene.fog) scene.fog.color = new THREE.Color(0x060912);
        if (envAmbient) envAmbient.intensity = 3.8;
        if (envMoon) envMoon.intensity = 3.2;
        if (envHemi) {
            envHemi.color.setHex(0x223366);
            envHemi.groundColor.setHex(0xff6600);
            envHemi.intensity = 0.7;
        }
        envNeonLights.forEach(l => { l.intensity = lowQuality ? 3.2 : 4.5; });
    } else {
        if (!USE_VIDEO_BACKGROUND) scene.background = new THREE.Color(0x9bb7d6);
        if (scene.fog) scene.fog.color = new THREE.Color(0xb4c7df);
        if (envAmbient) envAmbient.intensity = 2.2;
        if (envMoon) envMoon.intensity = 1.2;
        if (envHemi) {
            envHemi.color.setHex(0xcfd9e8);
            envHemi.groundColor.setHex(0xe6d7b8);
            envHemi.intensity = 0.9;
        }
        envNeonLights.forEach(l => { l.intensity = lowQuality ? 1.4 : 2.2; });
    }
}

function updateWeather(dt) {
    if (!rainPoints || weatherMode === 0) return;
    const pos = rainPoints.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - rainVel[i] * dt;
        if (y < 0) y = 160 + Math.random() * 60;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + 2.5 * dt);
    }
    pos.needsUpdate = true;

    if (weatherMode === 2 && lightningLight) {
        lightningTimer -= dt;
        if (lightningTimer <= 0 && Math.random() < 0.04) {
            lightningLight.intensity = 8 + Math.random() * 6;
            lightningTimer = 0.2 + Math.random() * 0.3;
        } else if (lightningLight.intensity > 0) {
            lightningLight.intensity *= 0.8;
            if (lightningLight.intensity < 0.2) lightningLight.intensity = 0;
        }
    }
}

function initTraffic() {
    const points = [
        new THREE.Vector3(-140, 0.1, -140),
        new THREE.Vector3(140, 0.1, -140),
        new THREE.Vector3(140, 0.1, 140),
        new THREE.Vector3(-140, 0.1, 140)
    ];
    trafficCurve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.8);
    trafficCurveLen = trafficCurve.getLength();

    const count = lowQuality ? 4 : 8;
    const carGeo = new THREE.BoxGeometry(1.6, 0.6, 3.2);
    const colors = [0xff3344, 0x33aaff, 0xffcc00, 0x55ff88, 0xbb66ff, 0xff8844];

    for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshStandardMaterial({
            color: colors[i % colors.length],
            emissive: colors[i % colors.length],
            emissiveIntensity: 0.6,
            roughness: 0.4,
            metalness: 0.6
        });
        const car = new THREE.Mesh(carGeo, mat);
        car.castShadow = false;
        car.receiveShadow = false;
        car.userData.t = Math.random();
        car.userData.speed = 12 + Math.random() * 10;
        scene.add(car);
        trafficCars.push(car);
    }
}

function updateTraffic(dt) {
    if (!trafficCurve || trafficCars.length === 0) return;
    trafficCars.forEach(car => {
        car.userData.t = (car.userData.t + (car.userData.speed * dt) / trafficCurveLen) % 1;
        const pos = trafficCurve.getPointAt(car.userData.t);
        const tangent = trafficCurve.getTangentAt(car.userData.t);
        car.position.copy(pos);
        car.position.y = 0.25;
        car.rotation.y = Math.atan2(tangent.x, tangent.z);
    });
}

function initMissions() {
    const ringGeo = new THREE.TorusGeometry(6.5, 0.35, 10, 32);
    missionPoints.forEach((p, idx) => {
        const mat = new THREE.MeshStandardMaterial({
            color: 0x00ffcc,
            emissive: 0x00ffcc,
            emissiveIntensity: 2,
            transparent: true,
            opacity: 0.7
        });
        const ring = new THREE.Mesh(ringGeo, mat);
        ring.position.copy(p);
        ring.rotation.x = Math.PI / 2;
        ring.visible = false;
        ring.userData.index = idx;
        scene.add(ring);
        missionRings.push(ring);
    });
}

function initPickups() {
    const count = lowQuality ? 10 : 18;
    const geo = new THREE.OctahedronGeometry(1.2, 0);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x66ff99,
        emissive: 0x66ff99,
        emissiveIntensity: 2.5,
        transparent: true,
        opacity: 0.85
    });

    for (let i = 0; i < count; i++) {
        const core = new THREE.Mesh(geo, mat.clone());
        const px = (Math.random() - 0.5) * 260;
        const pz = (Math.random() - 0.5) * 260;
        core.position.set(px, 1.2 + Math.random() * 1.5, pz);
        core.userData.collected = false;
        scene.add(core);
        pickupMeshes.push(core);
    }

    pickupCollected = 0;
    pickupTotal = pickupMeshes.length;
    if (pickupValueEl) pickupValueEl.textContent = `${pickupCollected} / ${pickupTotal}`;
}

function updatePickups(dt) {
    if (pickupMeshes.length === 0) return;
    pickupMeshes.forEach(core => {
        if (core.userData.collected) return;
        core.rotation.y += dt * 1.2;
        core.position.y += Math.sin(Date.now() * 0.002 + core.position.x) * 0.004;
        if (carRoot.position.distanceTo(core.position) < 3.2) {
            core.userData.collected = true;
            core.visible = false;
            pickupCollected += 1;
            if (pickupValueEl) pickupValueEl.textContent = `${pickupCollected} / ${pickupTotal}`;
        }
    });
}

function initSpeedCameras() {
    const camPos = [
        new THREE.Vector3(60, 0.2, 60),
        new THREE.Vector3(-70, 0.2, 90),
        new THREE.Vector3(-110, 0.2, -30),
        new THREE.Vector3(120, 0.2, -80),
        new THREE.Vector3(0, 0.2, -140)
    ];
    speedCameras = camPos.map(p => ({
        pos: p,
        radius: 10,
        limit: 80,
        cooldown: 6,
        last: -999
    }));
    speedFines = 0;
    if (fineValueEl) fineValueEl.textContent = `${speedFines}`;
}

function showEvent(msg, color) {
    if (!eventHudEl) return;
    eventHudEl.textContent = msg;
    eventHudEl.style.color = color || '#ff6666';
    eventHudEl.classList.add('active');
    eventTimer = 1.6;
}

function updateSpeedCameras(dt, speed) {
    if (speedCameras.length === 0) return;
    const kmh = Math.abs(speed) * 3.6;
    speedCameras.forEach(cam => {
        cam.last += dt;
        if (cam.last < cam.cooldown) return;
        const d = carRoot.position.distanceTo(cam.pos);
        if (d < cam.radius) {
            cam.last = 0;
            if (kmh > cam.limit) {
                speedFines += 1;
                if (fineValueEl) fineValueEl.textContent = `${speedFines}`;
                showEvent(`SPEED CAMERA | ${Math.round(kmh)} KM/H`, '#ff6666');
                if (audioCtx) playGearShiftSound('down');
            } else {
                showEvent('SPEED CAMERA CLEARED', '#66ff99');
            }
        }
    });
}

function startMission() {
    missionActive = true;
    missionIndex = 0;
    missionStartTime = performance.now();
    missionCooldown = 0;
    missionRings.forEach((r, i) => { r.visible = true; r.material.emissiveIntensity = i === 0 ? 5 : 1.5; });
    if (missionHudEl) {
        missionHudEl.textContent = `CHECKPOINT 1/${missionRings.length}`;
        missionHudEl.classList.add('active');
    }
}

function finishMission() {
    missionActive = false;
    const elapsed = (performance.now() - missionStartTime) / 1000;
    if (missionHudEl) {
        missionHudEl.textContent = `MISSION COMPLETE ${elapsed.toFixed(1)}s`;
        missionHudEl.classList.add('active');
    }
    missionRings.forEach(r => { r.visible = false; });
    missionCooldown = 3.5;
}

function updateMission(dt) {
    if (!missionActive) {
        if (missionCooldown > 0) {
            missionCooldown -= dt;
            if (missionCooldown <= 0 && missionHudEl) missionHudEl.classList.remove('active');
        }
        return;
    }

    const target = missionPoints[missionIndex];
    const dist = carRoot.position.distanceTo(target);
    if (dist < 8) {
        missionIndex++;
        if (missionIndex >= missionPoints.length) {
            finishMission();
            return;
        }
        missionRings.forEach((r, i) => { r.material.emissiveIntensity = i === missionIndex ? 5 : 1.5; });
    }

    if (missionHudEl) {
        const elapsed = (performance.now() - missionStartTime) / 1000;
        missionHudEl.textContent = `CHECKPOINT ${missionIndex + 1}/${missionRings.length} | ${elapsed.toFixed(1)}s`;
    }
}

function togglePhotoMode() {
    photoMode = !photoMode;
    if (photoMode) {
        photoYaw = Math.atan2(camera.position.x - carRoot.position.x, camera.position.z - carRoot.position.z);
        photoPitch = 0.2;
        if (photoModeEl) photoModeEl.classList.add('active');
        hudEl.style.opacity = '0';
    } else {
        if (photoModeEl) photoModeEl.classList.remove('active');
        hudEl.style.opacity = hudHidden ? '0' : '1';
    }
}

function updatePhotoControls(dt) {
    if (!(mouseButtons & 2)) {
        mouseDX = 0;
        mouseDY = 0;
    }
    if (mouseButtons & 2) {
        photoYaw += mouseDX * 0.0025;
        photoPitch = THREE.MathUtils.clamp(photoPitch - mouseDY * 0.002, -0.3, 1.2);
    }

    const speedMul = keys['shift'] ? 2.2 : 1.0;
    const forward = new THREE.Vector3(Math.sin(photoYaw), 0, Math.cos(photoYaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const move = new THREE.Vector3();

    if (keys['w']) move.add(forward);
    if (keys['s']) move.sub(forward);
    if (keys['a']) move.sub(right);
    if (keys['d']) move.add(right);
    if (keys['q']) move.y -= 1;
    if (keys['e']) move.y += 1;

    if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(photoSpeed * speedMul * dt);
        camera.position.add(move);
    }

    const lookAt = new THREE.Vector3(
        camera.position.x + Math.sin(photoYaw) * Math.cos(photoPitch),
        camera.position.y + Math.sin(photoPitch),
        camera.position.z + Math.cos(photoYaw) * Math.cos(photoPitch)
    );
    camera.lookAt(lookAt);
}

function updateSpeedLines(speed, boosting, dt) {
    if (!speedLines || !speedLineOffsets) return;
    const kmh = Math.abs(speed) * 3.6;
    const intensity = Math.min(kmh / 120, 1) * (boosting ? 1.3 : 1);
    speedLines.material.opacity = 0.6 * intensity;

    const pos = speedLines.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) {
        const oIdx = (i / 2) * 3;
        let z = speedLineOffsets[oIdx + 2] + speed * dt * 0.4;
        if (z > -1) z = -12 - Math.random() * 6;
        speedLineOffsets[oIdx + 2] = z;
        const x = speedLineOffsets[oIdx];
        const y = speedLineOffsets[oIdx + 1];
        pos.setXYZ(i, x, y, z);
        pos.setXYZ(i + 1, x, y, z - 1.8 - intensity * 2.2);
    }
    pos.needsUpdate = true;
}

function updateTrail(dt) {
    if (!trailPoints || !trailPositions) return;
    const speed = Math.abs(carSpeed);
    if (speed < 0.2) return;
    const sy = Math.sin(carRoot.rotation.y);
    const cy = Math.cos(carRoot.rotation.y);
    const backX = -sy * 1.6;
    const backZ = -cy * 1.6;
    trailPositions[trailIndex * 3] = carRoot.position.x + backX;
    trailPositions[trailIndex * 3 + 1] = carRoot.position.y + 0.2;
    trailPositions[trailIndex * 3 + 2] = carRoot.position.z + backZ;
    trailIndex = (trailIndex + 1) % (trailPositions.length / 3);
    trailPoints.geometry.attributes.position.needsUpdate = true;
}

function updateFollowSpot() {
    if (!followSpot) return;
    const sy = Math.sin(carRoot.rotation.y);
    const cy = Math.cos(carRoot.rotation.y);
    followSpot.position.set(
        carRoot.position.x - sy * 2,
        carRoot.position.y + 14,
        carRoot.position.z - cy * 2
    );
    followSpot.target.position.set(
        carRoot.position.x + sy * 2,
        carRoot.position.y + 1.2,
        carRoot.position.z + cy * 2
    );
}

function updateUnderglow(dt, boosting) {
    if (!underglow) return;
    underglow.visible = underglowOn;
    if (!underglowOn) return;
    const speed = Math.min(Math.abs(carSpeed) / MAX_SPEED, 1);
    const pulse = 1.4 + Math.sin(performance.now() * 0.006) * 0.6;
    const boostAmp = boosting ? 1.8 : 1.0;
    const intensity = (1.2 + speed * 1.8) * pulse * boostAmp;
    underglow.material.emissiveIntensity = intensity;
    underglow.material.opacity = 0.45 + speed * 0.35;
    const hue = (0.48 + speed * 0.12) % 1;
    underglow.material.emissive.setHSL(hue, 0.9, 0.6);
    underglow.material.color.setHSL(hue, 0.8, 0.5);
    underglow.scale.setScalar(1 + speed * 0.25);
    underglow.material.needsUpdate = true;
}

function spawnBoostShockwave() {
    const geo = new THREE.RingGeometry(1.6, 2.4, 56);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x66ccff,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(carRoot.position);
    ring.position.y += 0.12;
    ring.userData.life = 0;
    scene.add(ring);
    boostShockwaves.push(ring);
}

function updateBoostShockwaves(dt) {
    if (boostShockwaves.length === 0) return;
    for (let i = boostShockwaves.length - 1; i >= 0; i--) {
        const ring = boostShockwaves[i];
        ring.userData.life += dt;
        const t = ring.userData.life / 0.8;
        if (t >= 1) {
            scene.remove(ring);
            ring.geometry.dispose();
            ring.material.dispose();
            boostShockwaves.splice(i, 1);
            continue;
        }
        const scale = 1 + t * 12;
        ring.scale.setScalar(scale);
        ring.material.opacity = 0.85 * (1 - t);
    }
}

function initDriftSmoke() {
    const count = lowQuality ? 140 : 240;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3).fill(0);
    for (let i = 0; i < count; i++) arr[i * 3 + 1] = -9999;
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
        color: 0x888888,
        size: 0.7,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
    });
    driftSmokePts = new THREE.Points(geo, mat);
    scene.add(driftSmokePts);
    driftSmokeLife = new Float32Array(count);
    driftSmokeVel = Array.from({ length: count }, () => new THREE.Vector3());
}

function initTrail() {
    const trailCount = lowQuality ? 140 : 240;
    trailPositions = new Float32Array(trailCount * 3);
    for (let i = 0; i < trailCount; i++) {
        trailPositions[i * 3] = 0;
        trailPositions[i * 3 + 1] = -9999;
        trailPositions[i * 3 + 2] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const mat = new THREE.PointsMaterial({
        color: 0x00ffcc,
        size: lowQuality ? 0.12 : 0.18,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    trailPoints = new THREE.Points(geo, mat);
    scene.add(trailPoints);
}

function initUnderglow() {
    const geo = new THREE.RingGeometry(1.2, 3.6, 48);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x00ffcc,
        emissive: 0x00ffcc,
        emissiveIntensity: 2.2,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide
    });
    underglow = new THREE.Mesh(geo, mat);
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.set(0, 0.06, 0);
    carRoot.add(underglow);
}

function updateDriftSmoke(dt, pos, yaw, speed, drifting) {
    if (!driftSmokePts || !driftSmokeLife) return;
    const p = driftSmokePts.geometry.attributes.position;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);

    if (drifting && Math.abs(speed) > 6) {
        for (let i = 0; i < 2; i++) {
            const idx = driftSmokeIndex;
            const rx = (Math.random() - 0.5) * 0.8;
            const rz = (Math.random() - 0.5) * 0.8;
            const bx = pos.x - sy * 1.9 + rx;
            const bz = pos.z - cy * 1.9 + rz;
            p.setXYZ(idx, bx, pos.y + 0.1, bz);
            driftSmokeLife[idx] = 1;
            driftSmokeVel[idx].set((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 1.6);
            driftSmokeIndex = (driftSmokeIndex + 1) % driftSmokeLife.length;
        }
    }

    for (let i = 0; i < driftSmokeLife.length; i++) {
        if (driftSmokeLife[i] > 0) {
            driftSmokeLife[i] -= dt * 1.4;
            p.setXYZ(i, p.getX(i) + driftSmokeVel[i].x * dt, p.getY(i) + driftSmokeVel[i].y * dt, p.getZ(i) + driftSmokeVel[i].z * dt);
        } else {
            p.setXYZ(i, 0, -9999, 0);
        }
    }
    driftSmokePts.geometry.attributes.position.needsUpdate = true;
}

function captureSnapshot() {
    try {
        renderer.render(scene, camera);
        renderer.domElement.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `scout_${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    } catch (err) {
        console.warn('Snapshot failed:', err);
    }
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
const statusMiniEl = document.getElementById('status-mini');
const boostFillEl = document.getElementById('boost-fill');
const engineFillEl = document.getElementById('engine-fill');
const nitroFlashEl = document.getElementById('nitro-flash');
const missionHudEl = document.getElementById('mission-hud');
const eventHudEl = document.getElementById('event-hud');
const photoModeEl = document.getElementById('photo-mode');
const driftScoreEl = document.getElementById('drift-score-value');
const pickupValueEl = document.getElementById('pickup-value');
const fineValueEl = document.getElementById('fine-value');
let engineTemp = 20;

function drawSpeedometer(kmh) {
    const W = 160, H = 160, cx = 80, cy = 80, R = 66;
    const pct = Math.min(kmh / 320, 1);
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

    if (SHOW_NAME_IN_SPEEDOMETER) {
        document.getElementById('speed-value').textContent = 'JIBIN';
        document.getElementById('speed-unit').textContent = 'JOSE';
    } else {
        document.getElementById('speed-value').textContent = Math.round(kmh);
        document.getElementById('speed-unit').textContent = 'KM/H';
    }

    let gear = 'N';
    if (speed > 0.5) {
        if (kmh < 35) gear = '1';
        else if (kmh < 80) gear = '2';
        else if (kmh < 140) gear = '3';
        else if (kmh < 220) gear = '4';
        else gear = '5';
    }
    else if (speed < -0.3) gear = 'R';
    gearEl.textContent = gear;

    coordsEl.textContent = `X:${pos.x.toFixed(0)} Z:${pos.z.toFixed(0)} Y:${pos.y.toFixed(1)}`;
    if (statusMiniEl) {
        const wLabel = weatherMode === 0 ? 'CLEAR' : weatherMode === 1 ? 'RAIN' : 'STORM';
        const mLabel = missionActive ? 'ON' : 'OFF';
        const tLabel = timeOfDay === 0 ? 'NIGHT' : 'DAWN';
        statusMiniEl.textContent = `WEATHER: ${wLabel} | TIME: ${tLabel} | MISSION: ${mLabel}`;
    }

    if (driftScoreEl) {
        driftScoreEl.textContent = Math.round(driftScore).toString();
    }

    const throttleActive = throttleInput > 0.1;
    engineTemp = throttleActive ? Math.min(100, engineTemp + 12 * 0.016) : Math.max(20, engineTemp - 7 * 0.016);
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
    } else {
        // Drone — cinematic orbit + dolly
        const t = performance.now() * 0.0002;
        const r = 26 + Math.sin(t * 2.2) * 4;
        const y = 10 + Math.sin(t * 1.4) * 2.5;
        const yawAuto = t * 1.6;
        camera.position.set(
            pos.x + r * Math.sin(yawAuto),
            pos.y + y,
            pos.z + r * Math.cos(yawAuto)
        );
        const lookAhead = new THREE.Vector3(
            pos.x + sy * 6,
            pos.y + 2.2,
            pos.z + cy * 6
        );
        camera.lookAt(lookAhead);
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

function applyCarPaint(material) {
    if (!material || !material.color) return;
    if (material.transparent || material.opacity < 0.95) return;
    if (material.name && /glass|window|light|rim|tire|rubber|chrome/i.test(material.name)) return;
    material.color.setHex(CAR_BODY_COLOR);
}


// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
    setProgress(5, lowQuality ? 'FAST-LOAD MODE: BUILDING SCENE...' : 'BUILDING SCENE...');
    buildEnvironment();
    setupWeather();
    initMissions();
    initDriftSmoke();
    initTrail();
    initPickups();
    initSpeedCameras();
    setWeatherMode(0);
    setTimeOfDay(0);

    // ── DRACO loader for city (may be Draco-compressed)
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    const cityLoader = new GLTFLoader();
    cityLoader.setDRACOLoader(draco);

    // ── Separate plain loader for M3A1 (no Draco, preserves textures)
    const carLoader = new GLTFLoader();
    // Note: no DRACOLoader — avoids any decompression issues with textures

    // ════════════════════════════════════════════════════════════
    // 1. LOAD MEGA CITY
    // ════════════════════════════════════════════════════════════
    setProgress(10, 'LOADING MEGA CITY...');
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
        const actualSize = scaledBox.getSize(new THREE.Vector3());

        const centerOffset = new THREE.Vector3(
            -scaledBox.getCenter(new THREE.Vector3()).x,
            -scaledBox.min.y,
            -scaledBox.getCenter(new THREE.Vector3()).z
        );
        city.position.copy(centerOffset);

        // ── Fix floating props: hide any mesh above 60 world units
        // Tightened footprint to remove "boundary" empty spaces in GLB
        const cityFootprint = lowQuality ? 130 : 145;
        const maxHeight = lowQuality ? 50 : 55;

        // Spread tiles based on their dense footprint, not total raw bbox
        const offX = 130;
        const offZ = 130;

        const offsets = lowQuality
            ? [{ x: 0, z: 0 }]
            : [
                { x: -offX, z: -offZ }, { x: offX, z: -offZ },
                { x: -offX, z: offZ }, { x: offX, z: offZ }
            ];

        offsets.forEach((off, i) => {
            const tile = i === 0 ? city : city.clone();
            tile.position.x += off.x;
            tile.position.z += off.z;
            scene.add(tile);

            tile.traverse(c => {
                if (!c.isMesh) return;
                const wb = new THREE.Box3().setFromObject(c);
                const wc = wb.getCenter(new THREE.Vector3());

                // Hide if too high or outside the "dense" square to allow tight tiling
                if (wc.y > maxHeight ||
                    Math.abs(wc.x - off.x) > cityFootprint ||
                    Math.abs(wc.z - off.z) > cityFootprint) {
                    c.visible = false;
                }

                if (!c.visible) return;
                if (!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
                collidables.push(c);
            });
        });

        console.log(`Mega City: ${collidables.length} collidables`);
        setProgress(62, 'CITY LOADED ✓');

    } catch (err) {
        console.warn('City load failed:', err.message);
        setProgress(62, 'CITY LOAD FAILED');
    }

    // ════════════════════════════════════════════════════════════
    // 2. LOAD ROAD SYSTEM (Tiled asphalt model)
    // ════════════════════════════════════════════════════════════
    setProgress(63, 'TILING ROAD SYSTEM...');
    try {
        const roadGltf = await new Promise((res, rej) => cityLoader.load(
            '/models/patch_in_asfalt_road_-_free.glb', res, undefined, rej
        ));
        const roadModel = roadGltf.scene;

        // Perfect Square Tiling: force X and Z to exactly 100 units to eliminate gaps
        const rb = new THREE.Box3().setFromObject(roadModel);
        const rSize = rb.getSize(new THREE.Vector3());

        let scaleX = 105 / (rSize.x || 1);
        let scaleZ = 105 / (rSize.z || 1);

        // Squash the Y axis drastically to make the road completely flat and remove slopes
        roadModel.scale.set(scaleX, 0.001, scaleZ);

        // Ensure its rotation is flat
        roadModel.rotation.set(0, 0, 0);

        const TILE_DIM = 100; // Step by 100, but scaled to 105 = 5 unit overlap to hide gaps
        const GRID_SIZE = 4; // 9x9 grid to cover ~900 units

        // Dark base plane just in case of microscopic seams
        const baseGeo = new THREE.PlaneGeometry(1000, 1000);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 1.0 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.rotation.x = -Math.PI / 2;
        base.position.y = -0.2; // slightly below roads
        scene.add(base);

        for (let x = -GRID_SIZE; x <= GRID_SIZE; x++) {
            for (let z = -GRID_SIZE; z <= GRID_SIZE; z++) {
                const tr = roadModel.clone();
                tr.position.set(x * TILE_DIM, -0.05, z * TILE_DIM);
                tr.receiveShadow = true;
                scene.add(tr);
            }
        }
        setProgress(64, 'ROAD SYSTEM LOADED ✓');
    } catch (err) {
        console.warn('Road loading failed:', err);
        // Fallback ground if road GLB fails
        const g = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        g.rotation.x = -Math.PI / 2; g.position.y = -0.1; scene.add(g);
    }

    initTraffic();

    // ════════════════════════════════════════════════════════════
    // 3. LOAD CAR (car.glb)
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
                applyCarPaint(m);
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
        cubeRenderTarget = new THREE.WebGLCubeRenderTarget(lowQuality ? 64 : 128, {
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
    initUnderglow();

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

    // â”€â”€ Brake lights
    brakeLightL = new THREE.PointLight(0xff3344, 0.6, 8, 2);
    brakeLightR = new THREE.PointLight(0xff3344, 0.6, 8, 2);
    brakeLightL.position.set(-0.6, 0.6, -2.2);
    brakeLightR.position.set(0.6, 0.6, -2.2);
    carRoot.add(brakeLightL, brakeLightR);

    // ── Show game
    setProgress(100, vehicleLoaded ? 'JIBIN JOSE READY — PRESS W TO EXPLORE!' : 'SCENE READY — PRESS W TO EXPLORE!');
    await new Promise(r => setTimeout(r, 600));
    loadingEl.style.transition = 'opacity 0.8s';
    loadingEl.style.opacity = '0';
    setTimeout(() => { loadingEl.style.display = 'none'; }, 800);
    hudEl.style.opacity = '1';

    // Bruno Simon-inspired premium title text
    const titleOverlay = document.createElement('div');
    titleOverlay.id = 'premium-title';
    titleOverlay.innerHTML = `
        <div style="font-size: 4rem; font-weight: 900; letter-spacing: -2px; color: white; text-shadow: 0 4px 20px rgba(0,0,0,0.8); margin-bottom: -10px;">Jibin Jose</div>
        <div style="font-size: 1.2rem; color: #00ffcc; letter-spacing: 4px; font-weight: 400; text-shadow: 0 0 10px rgba(0,255,204,0.5);">Software Engineer</div>
        <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); letter-spacing: 2px; margin-top: 15px;">W,A,S,D TO NAVIGATE THE PORTFOLIO</div>
    `;
    titleOverlay.style.position = 'absolute';
    titleOverlay.style.top = '10%';
    titleOverlay.style.left = '50%';
    titleOverlay.style.transform = 'translateX(-50%) translateY(30px)';
    titleOverlay.style.textAlign = 'center';
    titleOverlay.style.opacity = '0';
    titleOverlay.style.transition = 'all 2s cubic-bezier(0.16, 1, 0.3, 1)';
    titleOverlay.style.pointerEvents = 'none';
    titleOverlay.style.zIndex = '5';
    titleOverlay.style.fontFamily = "'Inter', 'Helvetica Neue', sans-serif";
    document.getElementById('app').appendChild(titleOverlay);

    setTimeout(() => {
        titleOverlay.style.opacity = '1';
        titleOverlay.style.transform = 'translateX(-50%) translateY(0px)';
    }, 1500);

    window.vehicleLoadedGlobal = true; // Signal for intro sweep
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
            return _cvTmp.distanceTo(carRoot.position) < 120; // Expanded for larger tiles
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
            const impact = Math.min(Math.abs(carSpeed) / 45, 1.2);
            screenShakeAmt = impact * 2.2;
            playCollisionSound(impact);

            // ── HIGH COLLISION ACCIDENT LOGIC ──────────────────
            if (impact > 0.82) {
                isSpinningOut = true;
                spinTimer = 1.6; // Duration of spinning accident
            }

            // Visual Flash (Accident)
            document.body.classList.add('accident-blur');
            const flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,0,0,0.5);pointer-events:none;z-index:9999;animation:crashFlash 0.4s forwards;';
            document.body.appendChild(flash);
            setTimeout(() => {
                flash.remove();
                if (!isSpinningOut) document.body.classList.remove('accident-blur');
            }, 450);
        }
    }
    return collided;
}

function playCollisionSound(intensity = 0.5) {
    if (!audioCtx || soundMuted) return;

    const now = audioCtx.currentTime;

    // 1. LOW THUD (Sine impact)
    const thud = audioCtx.createOscillator();
    const thudGain = audioCtx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(140 * intensity, now);
    thud.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    thudGain.gain.setValueAtTime(0.7 * intensity, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    thud.connect(thudGain);
    thudGain.connect(audioCtx.destination);
    thud.start(); thud.stop(now + 0.2);

    // 2. METAL NOISE BURST
    const noiseLen = Math.floor(audioCtx.sampleRate * 0.25);
    const noiseBuf = audioCtx.createBuffer(1, noiseLen, audioCtx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
        nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.04));
    }

    const noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 450 + 800 * intensity;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.45 * intensity;

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noiseSrc.start();
}

// ═══════════════════════════════════════════════════════════════
//  ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    // ── ACCIDENT SPIN-OUT SEQUENCE ───────────────────────
    if (isSpinningOut) {
        spinTimer -= dt;
        carRoot.rotation.y += dt * 18; // Cinematic Spinning
        carVel.multiplyScalar(0.96);
        carSpeed *= 0.96;
        screenShakeAmt = 1.2;

        if (spinTimer <= 0) {
            isSpinningOut = false;
            document.body.classList.remove('accident-blur');
            // Auto Reset back to start
            carRoot.position.set(17, 0.1, 40);
            carRoot.rotation.set(0, Math.PI, 0);
            carSpeed = 0; carVel.set(0, 0, 0);
        }

        // Update visuals during crash
        updateHUD(carSpeed, carRoot.rotation.y, carRoot.position);
        updateAudio(carSpeed, false, true);
        updateParticles(dt, carRoot.position, carRoot.rotation.y, 25);
        updateDriftSmoke(dt, carRoot.position, carRoot.rotation.y, carSpeed, true);
        updateSpeedLines(carSpeed, false, dt);
        updateTrail(dt);
        updateFollowSpot();
        updateUnderglow(dt, false);
        updateBoostShockwaves(dt);
        updateWeather(dt);
        updateTraffic(dt);
        if (frameCount % 60 === 0) updateReflections();
        renderer.render(scene, camera);
        frameCount++;
        return; // Block user control during crash
    }

    // ── Read keys ──────────────────────────────────────────
    pollGamepad();

    const kbFwd = keys['w'] || keys['arrowup'];
    const kbBack = keys['s'] || keys['arrowdown'];
    const kbLeft = keys['a'] || keys['arrowleft'];
    const kbRight = keys['d'] || keys['arrowright'];

    const mouseThrottle = (mouseButtons & 1) !== 0;
    const mouseBrake = (mouseButtons & 2) !== 0;
    if (!(mouseButtons & 1)) {
        mouseSteer *= 0.9;
    }

    let steerInput = THREE.MathUtils.clamp(
        (kbLeft ? 1 : 0) + (kbRight ? -1 : 0) + mouseSteer + touchState.steer + gamepadState.steer,
        -1, 1
    );

    throttleInput = Math.max(kbFwd ? 1 : 0, mouseThrottle ? 1 : 0, touchState.throttle ? 1 : 0, gamepadState.throttle);
    brakeInput = Math.max(kbBack ? 1 : 0, mouseBrake ? 1 : 0, touchState.brake ? 1 : 0, gamepadState.brake);

    let boosting = (keys['shift'] || keys['shiftleft'] || touchState.boost || gamepadState.boost) && boostFuel > 0;
    const handbrake = keys[' '] || touchState.handbrake || gamepadState.handbrake;

    // Camera switch (C / Gamepad Y / Mobile Cam, one-shot)
    const cNow = keys['c'] || touchState.camSwitch || gamepadState.camSwitch;
    if (cNow && !camSwitchedLastFrame) {
        cameraMode = (cameraMode + 1) % 4;
        if (cameraMode === 3) showEvent('CAMERA: DRONE', '#66ccff');
    }
    camSwitchedLastFrame = cNow;

    // Reset (R / Gamepad X / Mobile Reset, one-shot)
    const rNow = keys['r'] || touchState.reset || gamepadState.reset;
    if (rNow && !resetPressedLastFrame) {
        const safeSpots = [new THREE.Vector3(17, 0.1, 40), ...missionPoints];
        let best = safeSpots[0];
        let bestD = Infinity;
        safeSpots.forEach(p => {
            const d = carRoot.position.distanceTo(p);
            if (d < bestD) { bestD = d; best = p; }
        });
        carRoot.position.copy(best);
        carRoot.rotation.set(0, Math.PI, 0);
        carSpeed = 0; carSteer = 0; boostFuel = 100;
        carVel.set(0, 0, 0);
        driftFactor = 0;
    }
    resetPressedLastFrame = rNow;
    touchState.camSwitch = false;
    touchState.reset = false;

    const vNow = keys['v'];
    if (vNow && !demoPressedLastFrame) {
        demoMode = !demoMode;
        showEvent(demoMode ? 'SHOWCASE MODE ON' : 'SHOWCASE MODE OFF', demoMode ? '#00ffcc' : '#ff6666');
    }
    demoPressedLastFrame = vNow;

    const uNow = keys['u'];
    if (uNow && !glowPressedLastFrame) {
        underglowOn = !underglowOn;
        showEvent(underglowOn ? 'NEON GLOW ON' : 'NEON GLOW OFF', underglowOn ? '#66ccff' : '#ff6666');
    }
    glowPressedLastFrame = uNow;

    if (demoMode) {
        demoTime += dt;
        steerInput = Math.sin(demoTime * 0.6) * 0.65;
        throttleInput = 0.85;
        brakeInput = 0;
        boosting = Math.sin(demoTime * 0.45) > 0.7 && boostFuel > 0;
    }

    if (boosting && !boostingLastFrame) {
        spawnBoostShockwave();
    }
    boostingLastFrame = boosting;

    const tNow = keys['t'] || touchState.weather;
    if (tNow && !weatherPressedLastFrame) {
        setWeatherMode((weatherMode + 1) % 3);
    }
    weatherPressedLastFrame = tNow;
    touchState.weather = false;

    const mNow = keys['m'] || touchState.mission;
    if (mNow && !missionPressedLastFrame) {
        if (!missionActive) startMission();
    }
    missionPressedLastFrame = mNow;
    touchState.mission = false;

    const pNow = keys['p'] || touchState.photo;
    if (pNow && !photoPressedLastFrame) {
        togglePhotoMode();
    }
    photoPressedLastFrame = pNow;
    touchState.photo = false;

    const oNow = keys['o'];
    if (oNow && !snapshotPressedLastFrame) {
        captureSnapshot();
    }
    snapshotPressedLastFrame = oNow;

    const nNow = keys['n'];
    if (nNow && !timePressedLastFrame) {
        setTimeOfDay(timeOfDay === 0 ? 1 : 0);
    }
    timePressedLastFrame = nNow;

    const hNow = keys['h'];
    if (hNow && !hudPressedLastFrame) {
        hudHidden = !hudHidden;
        hudEl.style.opacity = hudHidden ? '0' : '1';
    }
    hudPressedLastFrame = hNow;

    if (photoMode) {
        updateWeather(dt);
        updateTraffic(dt);
        updatePickups(dt);
        updateSpeedCameras(dt, carSpeed);
        updatePhotoControls(dt);
        updateSpeedLines(0, false, dt);
        mouseDX = 0; mouseDY = 0;
        renderer.render(scene, camera);
        return;
    }

    // ── STEERING (FIXED: A=left, D=right from driver view) ───
    // Positive steer = CCW yaw = left turn from driver's perspective (camera behind)
    const steerTarget = steerInput * MAX_STEER;
    carSteer += (steerTarget - carSteer) * Math.min(dt * STEER_RATE, 1);

    // ── SPEED ──────────────────────────────────────────────
    const topSpd = boosting ? BOOST_SPEED : MAX_SPEED;
    if (throttleInput > 0.05) {
        carSpeed = Math.min(carSpeed + (boosting ? ACCEL * 1.8 : ACCEL) * throttleInput * dt, topSpd);
    } else if (brakeInput > 0.05) {
        if (carSpeed > 0.5) carSpeed -= BRAKE_FORCE * brakeInput * dt;
        else carSpeed = Math.max(carSpeed - REV_SPEED * brakeInput * dt, -REV_SPEED);
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
        carRoot.position.x = THREE.MathUtils.clamp(carRoot.position.x, -355, 355);
        carRoot.position.z = THREE.MathUtils.clamp(carRoot.position.z, -355, 355);
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

    // Drift scoring
    const kmh = Math.abs(carSpeed) * 3.6;
    if (isDrifting && kmh > 20) {
        const steerAmt = Math.min(Math.abs(carSteer) / MAX_STEER, 1);
        const add = (kmh * 0.02 + steerAmt * 6) * dt;
        driftCombo += add;
        driftBankTimer = 0.4;
    } else {
        driftBankTimer -= dt;
        if (driftBankTimer <= 0 && driftCombo > 0) {
            driftScore += driftCombo;
            driftCombo = 0;
        }
    }

    // ── BOOST ──────────────────────────────────────────────
    if (boosting && Math.abs(carSpeed) > 0.5) {
        boostFuel = Math.max(0, boostFuel - 28 * dt);
        nitroFlashEl.style.opacity = boostFuel > 0 ? '0.5' : '0';
    } else {
        boostFuel = Math.min(100, boostFuel + 16 * dt);
        nitroFlashEl.style.opacity = '0';
    }
    boostFillEl.style.width = boostFuel + '%';

    if (brakeLightL && brakeLightR) {
        const brakeLevel = Math.max(brakeInput, carSpeed < -0.2 ? 1 : 0);
        const intensity = 0.4 + brakeLevel * 2.2;
        brakeLightL.intensity = intensity;
        brakeLightR.intensity = intensity;
    }

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
    const accelTilt = throttleInput > 0.05 ? -1 : brakeInput > 0.05 ? 1 : 0;
    carRoot.rotation.x = THREE.MathUtils.lerp(carRoot.rotation.x,
        accelTilt * speedPct * 0.028, 0.08);

    // ── ENGINE AUDIO ───────────────────────────────────────
    updateAudio(carSpeed, boosting, isDrifting);

    // ── DRIFT INDICATOR ────────────────────────────────────
    if (driftIndicatorEl) {
        driftIndicatorEl.style.opacity = isDrifting ? '1' : '0';
    }

    // ── Particles ──────────────────────────────────────────
    updateParticles(dt, carRoot.position, carRoot.rotation.y, carSpeed);
    updateDriftSmoke(dt, carRoot.position, carRoot.rotation.y, carSpeed, isDrifting);
    updateSpeedLines(carSpeed, boosting, dt);
    updateTrail(dt);
    updateFollowSpot();
    updateUnderglow(dt, boosting);
    updateBoostShockwaves(dt);
    updateWeather(dt);
    updateTraffic(dt);
    updatePickups(dt);
    updateSpeedCameras(dt, carSpeed);
    if (window.envSmoke) {
        window.envSmoke.rotation.y -= dt * 0.03; // Animate environmental smoke
    }
    if (window.holoNodes) {
        window.holoNodes.forEach((node, idx) => {
            node.rotation.x += dt * 0.5;
            node.rotation.y += dt * 0.8;
            node.position.y += Math.sin(Date.now() * 0.002 + idx) * 0.02;
        });
    }

    // ── Camera ─────────────────────────────────────────────
    const camTarget = carRoot.position.clone();
    camTarget.y += 2.5;

    // Cinematic Intro Sweep
    if (!introSweepDone && window.vehicleLoadedGlobal) {
        sweepTime += dt * 0.4;
        const startPos = new THREE.Vector3(17, 80, 0); // High up and back
        const endPos = new THREE.Vector3(17, 6, 54);   // Normal start position behind car

        // Easing function (easeOutCubic)
        const t = Math.min(sweepTime, 1);
        const easeT = 1 - Math.pow(1 - t, 3);

        camera.position.lerpVectors(startPos, endPos, easeT);

        if (t >= 1) {
            introSweepDone = true;
            camPos.copy(camera.position); // hand over control
        }
    } else {
        updateCamera(dt);
    }

    if (introSweepDone || window.vehicleLoadedGlobal) {
        camera.lookAt(camTarget);
    }

    const targetFov = BASE_FOV + speedPct * 6 + (boosting ? 6 : 0);
    camera.fov += (targetFov - camera.fov) * 0.08;
    camera.updateProjectionMatrix();

    // ── FRAME COUNTER ───────────────────────────────────────
    frameCount++;

    // ── PRO REAL-TIME REFLECTIONS (Optimized: every 10 frames) ──
    if (envCubeCamera && frameCount % REFLECT_EVERY === 0) {
        carRoot.visible = false;            // hide so car doesn't reflect itself
        envCubeCamera.position.copy(carRoot.position);
        envCubeCamera.position.y += 1;
        envCubeCamera.update(renderer, scene);
        carRoot.visible = true;
    }

    // ── COLLISION DETECTION (NOW HANDLED IN SUB-STEPS) ──────
    // checkCollisions();

    // -- SPEED-BASED CAMERA SHAKE --
    const speedShake = Math.min(Math.abs(carSpeed) / MAX_SPEED, 1) * 0.05;
    if (speedShake > 0.002) {
        camera.position.x += (Math.random() - 0.5) * speedShake;
        camera.position.y += (Math.random() - 0.5) * speedShake * 0.5;
        camera.position.z += (Math.random() - 0.5) * speedShake * 0.35;
    }

    // ── SCREEN SHAKE ────────────────────────────────────────
    if (screenShakeAmt > 0.002) {
        camera.position.x += (Math.random() - 0.5) * screenShakeAmt;
        camera.position.y += (Math.random() - 0.5) * screenShakeAmt * 0.4;
        camera.position.z += (Math.random() - 0.5) * screenShakeAmt * 0.15;
        screenShakeAmt *= 0.68;   // exponential decay
    }

    // ── HUD ────────────────────────────────────────────────
    updateHUD(carSpeed, carRoot.rotation.y, carRoot.position);

    // ── RESUME SCAN LOGIC ──────────────────────────────────
    updateResumeLogic(dt);
    updateMission(dt);
    if (eventTimer > 0) {
        eventTimer -= dt;
        if (eventTimer <= 0 && eventHudEl) eventHudEl.classList.remove('active');
    }

    mouseDX = 0; mouseDY = 0;
    renderer.render(scene, camera);
}

function updateResumeLogic(dt) {
    const carPos = carRoot.position;
    let closestSection = null;
    let minDist = Infinity;

    resumeMarkers.forEach(m => {
        const dist = carPos.distanceTo(m.marker.position);
        // Pulse animation for markers
        m.marker.children[2].rotation.y += dt * 1.5;
        m.marker.children[2].rotation.x += dt * 0.8;
        m.marker.position.y = 0.5 + Math.sin(Date.now() * 0.003) * 0.1;

        if (dist < minDist) {
            minDist = dist;
            closestSection = m;
        }
    });

    const promptEl = document.getElementById('resume-prompt');
    const containerEl = document.getElementById('resume-container');
    const titleEl = document.getElementById('resume-title');
    const contentEl = document.getElementById('resume-content');

    if (!promptEl || !containerEl) return;

    if (closestSection && minDist < SCAN_READY_RANGE) {
        if (minDist < SCAN_RANGE) {
            // In scan range
            if (currentActiveResume !== closestSection.data.id) {
                currentActiveResume = closestSection.data.id;
                titleEl.textContent = closestSection.data.title;
                contentEl.innerHTML = closestSection.data.content;
                containerEl.classList.add('active');
                promptEl.classList.remove('active');
            }
        } else {
            // Near but not scanning
            promptEl.classList.add('active');
            promptEl.textContent = `APPROACH [${closestSection.data.title}] TO VIEW`;
            if (currentActiveResume) {
                containerEl.classList.remove('active');
                currentActiveResume = null;
            }
        }
    } else {
        // Out of range
        promptEl.classList.remove('active');
        if (currentActiveResume) {
            containerEl.classList.remove('active');
            currentActiveResume = null;
        }
    }
}

function initResumeMarkers() {
    resumeData.forEach(section => {
        const group = new THREE.Group();
        group.position.set(section.position.x, 0.5, section.position.z);

        // Cyber cylinder marker
        const cylGeo = new THREE.CylinderGeometry(2, 2, 0.1, 32);
        const cylMat = new THREE.MeshStandardMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.6,
            emissive: 0x00ffcc,
            emissiveIntensity: 5
        });
        const cyl = new THREE.Mesh(cylGeo, cylMat);
        group.add(cyl);

        // Vertical beams
        const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 15, 8);
        const beamMat = new THREE.MeshStandardMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.2,
            emissive: 0x00ffcc,
            emissiveIntensity: 2
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = 7.5;
        group.add(beam);

        // Floating icon (simple cube/diamond for now)
        const iconGeo = new THREE.OctahedronGeometry(1.2, 0);
        const iconMat = new THREE.MeshStandardMaterial({
            color: 0x00ffcc,
            emissive: 0x00ffcc,
            emissiveIntensity: 8,
            wireframe: true
        });
        const icon = new THREE.Mesh(iconGeo, iconMat);
        icon.position.y = 2;
        group.add(icon);

        scene.add(group);
        resumeMarkers.push({ marker: group, data: section });

        // Add floor marking
        const floorGeo = new THREE.RingGeometry(2.5, 3, 32);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(section.position.x, 0.01, section.position.z);
        scene.add(floor);
    });
}

// ── Resize ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
});

initResumeMarkers();
init();
