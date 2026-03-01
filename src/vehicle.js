import * as THREE from 'three';

// ─── VEHICLE PHYSICS CONSTANTS ───────────────────────────────────────────────
const MAX_SPEED = 28;    // m/s  (~100 km/h at top)
const BOOST_SPEED = 42;    // m/s  during nitro
const ACCEL = 22;    // m/s²
const BRAKE_FORCE = 38;    // m/s²
const REVERSE_ACCEL = 10;
const FRICTION = 0.94;  // multiplicative per frame
const STEER_SPEED = 2.2;   // rad/s
const STEER_RETURN = 6;     // how fast wheels return to center
const STEER_LIMIT = 0.52;  // max wheel angle (rad)
const TRACTION = 0.88;  // lateral grip

// ─── WHEEL OFFSETS (relative to car body center) ─────────────────────────────
const WHEEL_DEFS = [
    { id: 'FL', offset: new THREE.Vector3(-0.95, -0.35, 1.2), front: true, side: -1 },
    { id: 'FR', offset: new THREE.Vector3(0.95, -0.35, 1.2), front: true, side: 1 },
    { id: 'RL', offset: new THREE.Vector3(-0.95, -0.35, -1.3), front: false, side: -1 },
    { id: 'RR', offset: new THREE.Vector3(0.95, -0.35, -1.3), front: false, side: 1 },
];

// ─── CREATE VEHICLE ──────────────────────────────────────────────────────────
export function createVehicle(scene, gltf) {
    const root = new THREE.Group();
    scene.add(root);

    let bodyMesh;

    if (gltf) {
        // ── Use GLB model ──
        const model = gltf.scene;
        model.scale.setScalar(1);
        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        // Auto-center
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        model.position.y = size.y / 2; // sit on ground

        root.add(model);
        bodyMesh = model;
    } else {
        // ── Placeholder Box Car ──
        bodyMesh = buildBoxCar(root);
    }

    root.position.set(0, 0.01, 0);

    // ── Wheels (visual only, always created) ──
    const wheels = gltf ? [] : buildWheels(root);

    // ── Exhaust particles ─────────────────────────────────────────────────
    const exhaustParticles = buildExhaustParticles(scene);

    // ── Dust particles ───────────────────────────────────────────────────
    const dustParticles = buildDustParticles(scene);

    // ── Headlights ───────────────────────────────────────────────────────
    const headlightL = new THREE.SpotLight(0xffffff, 3, 40, Math.PI / 10, 0.3);
    const headlightR = new THREE.SpotLight(0xffffff, 3, 40, Math.PI / 10, 0.3);
    headlightL.position.set(-0.6, 0.5, 1.8);
    headlightR.position.set(0.6, 0.5, 1.8);
    root.add(headlightL, headlightR);
    // targets
    const tL = new THREE.Object3D(); tL.position.set(-0.6, 0, 10);
    const tR = new THREE.Object3D(); tR.position.set(0.6, 0, 10);
    root.add(tL, tR);
    headlightL.target = tL;
    headlightR.target = tR;

    // ── Brake lights ─────────────────────────────────────────────────────
    const brakeLightMat = new THREE.MeshStandardMaterial({
        color: 0xff1111, emissive: 0xff1111, emissiveIntensity: 0,
    });
    const brakeGeoL = new THREE.BoxGeometry(0.3, 0.1, 0.05);
    const brakeMeshL = new THREE.Mesh(brakeGeoL, brakeLightMat.clone());
    const brakeMeshR = new THREE.Mesh(brakeGeoL.clone(), brakeLightMat.clone());
    brakeMeshL.position.set(-0.7, 0.3, -1.5);
    brakeMeshR.position.set(0.7, 0.3, -1.5);
    root.add(brakeMeshL, brakeMeshR);

    // ── Under-car glow ───────────────────────────────────────────────────
    const underglow = new THREE.PointLight(0x00ffcc, 1.5, 5, 2);
    underglow.position.set(0, -0.3, 0);
    root.add(underglow);

    // ── Physics state ────────────────────────────────────────────────────
    let speedRef = 0;
    let steerAngle = 0;
    let bodyPitch = 0;  // visual body lean forward/back
    let bodyRoll = 0;  // visual body roll on corners
    let onGround = true;
    let vertVel = 0;
    const GRAVITY = 20;
    const GROUND_Y = 0.01;

    // ── Exhaust state ────────────────────────────────────────────────────
    const exhaustPositions = exhaustParticles.geometry.attributes.position;
    const exhaustAlpha = exhaustParticles.geometry.attributes.alpha;
    const EXHAUST_COUNT = 60;
    const exPos = []; const exLife = []; const exVel = [];
    for (let i = 0; i < EXHAUST_COUNT; i++) {
        exPos.push(new THREE.Vector3());
        exLife.push(0);
        exVel.push(new THREE.Vector3());
    }
    let exhaustIdx = 0;

    const dustPositions = dustParticles.geometry.attributes.position;
    const dustAlpha = dustParticles.geometry.attributes.alpha;
    const DUST_COUNT = 80;
    const duPos = []; const duLife = []; const duVel = [];
    for (let i = 0; i < DUST_COUNT; i++) {
        duPos.push(new THREE.Vector3());
        duLife.push(0);
        duVel.push(new THREE.Vector3());
    }
    let dustIdx = 0;

    // ─────────────────────────────────────────────────────────────────────
    function update(dt, input, boostFuel) {
        const fwd = input.keys['w'] || input.keys['W'] || input.keys['ArrowUp'];
        const back = input.keys['s'] || input.keys['S'] || input.keys['ArrowDown'];
        const left = input.keys['a'] || input.keys['A'] || input.keys['ArrowLeft'];
        const right = input.keys['d'] || input.keys['D'] || input.keys['ArrowRight'];
        const boost = (input.keys['shift'] || input.keys['ShiftLeft']) && boostFuel > 0;
        const brake = input.keys[' ']; // spacebar handbrake

        // ── Steering ──────────────────────────────────────────────────────
        const targetSteer = left ? -STEER_LIMIT : right ? STEER_LIMIT : 0;
        steerAngle += (targetSteer - steerAngle) * Math.min(dt * STEER_RETURN, 1);

        // ── Speed ─────────────────────────────────────────────────────────
        const topSpeed = boost ? BOOST_SPEED : MAX_SPEED;

        if (fwd) {
            const accelFactor = boost ? ACCEL * 1.6 : ACCEL;
            speedRef = THREE.MathUtils.clamp(speedRef + accelFactor * dt, -8, topSpeed);
        } else if (back) {
            if (speedRef > 0.3) {
                // braking
                speedRef -= BRAKE_FORCE * dt;
            } else {
                speedRef = THREE.MathUtils.clamp(speedRef - REVERSE_ACCEL * dt, -8, 0);
            }
        } else if (brake) {
            speedRef *= Math.pow(0.82, dt * 60);
        } else {
            speedRef *= Math.pow(FRICTION, dt * 60);
        }

        if (Math.abs(speedRef) < 0.01) speedRef = 0;

        // ── Rotation (speed-dependent steering) ───────────────────────────
        const turning = steerAngle * (speedRef / MAX_SPEED) * TRACTION;
        root.rotation.y += turning * dt * STEER_SPEED * 1.8;

        // ── Position ──────────────────────────────────────────────────────
        const sin = Math.sin(root.rotation.y);
        const cos = Math.cos(root.rotation.y);
        root.position.x += sin * speedRef * dt;
        root.position.z += cos * speedRef * dt;

        // World bounds
        root.position.x = THREE.MathUtils.clamp(root.position.x, -290, 290);
        root.position.z = THREE.MathUtils.clamp(root.position.z, -290, 290);

        // ── Simple gravity / ground ────────────────────────────────────────
        if (root.position.y > GROUND_Y) {
            vertVel -= GRAVITY * dt;
            root.position.y += vertVel * dt;
        } else {
            root.position.y = GROUND_Y;
            vertVel = 0;
            onGround = true;
        }

        // ── Body lean ─────────────────────────────────────────────────────
        const targetPitch = fwd ? -0.04 : back ? 0.07 : 0;
        const targetRoll = -steerAngle * 0.12 * Math.sign(speedRef);
        bodyPitch += (targetPitch - bodyPitch) * Math.min(dt * 6, 1);
        bodyRoll += (targetRoll - bodyRoll) * Math.min(dt * 6, 1);

        if (bodyMesh) {
            bodyMesh.rotation.x = bodyPitch;
            if (!gltf) bodyMesh.rotation.z = bodyRoll; // only for box car
        }

        // ── Wheel rotation (visual) ────────────────────────────────────────
        if (wheels.length > 0) {
            const wheelAngularVel = speedRef / 0.4; // approx radius
            wheels.forEach(w => {
                w.mesh.rotation.x += wheelAngularVel * dt;
                if (w.front) {
                    w.mesh.rotation.y = w.side * steerAngle;
                }
            });
        }

        // ── Brake lights ──────────────────────────────────────────────────
        const braking = back && speedRef > 0.3 || brake;
        [brakeMeshL, brakeMeshR].forEach(m => {
            m.material.emissiveIntensity = braking ? 5 : 0;
        });
        underglow.intensity = boost ? 3 : 1.2;

        // ── Exhaust particles ─────────────────────────────────────────────
        if (fwd || Math.abs(speedRef) > 1) {
            const ep = exPos[exhaustIdx];
            const worldExhaust = root.localToWorld(new THREE.Vector3(0, 0.1, -1.6));
            ep.copy(worldExhaust);
            exLife[exhaustIdx] = 1;
            exVel[exhaustIdx].set(
                (Math.random() - 0.5) * 0.5,
                Math.random() * 0.3 + 0.1,
                Math.cos(root.rotation.y) * -speedRef * 0.08
            );
            exhaustIdx = (exhaustIdx + 1) % EXHAUST_COUNT;
        }

        for (let i = 0; i < EXHAUST_COUNT; i++) {
            if (exLife[i] > 0) {
                exLife[i] -= dt * 1.5;
                exPos[i].add(exVel[i].clone().multiplyScalar(dt));
                exhaustPositions.setXYZ(i, exPos[i].x, exPos[i].y, exPos[i].z);
                exhaustAlpha.setX(i, Math.max(0, exLife[i]));
            } else {
                exhaustPositions.setXYZ(i, 0, -100, 0);
                exhaustAlpha.setX(i, 0);
            }
        }
        exhaustParticles.geometry.attributes.position.needsUpdate = true;
        exhaustParticles.geometry.attributes.alpha.needsUpdate = true;

        // ── Dust particles ────────────────────────────────────────────────
        if (Math.abs(speedRef) > 2) {
            const dp = duPos[dustIdx];
            const wordlDust = root.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 1, 0, -1.2));
            dp.copy(wordlDust);
            duLife[dustIdx] = 1;
            duVel[dustIdx].set(
                (Math.random() - 0.5) * 1.2,
                Math.random() * 0.8,
                (Math.random() - 0.5) * 1.2
            );
            dustIdx = (dustIdx + 1) % DUST_COUNT;
        }
        for (let i = 0; i < DUST_COUNT; i++) {
            if (duLife[i] > 0) {
                duLife[i] -= dt * 2;
                duPos[i].add(duVel[i].clone().multiplyScalar(dt));
                dustPositions.setXYZ(i, duPos[i].x, duPos[i].y, duPos[i].z);
                dustAlpha.setX(i, Math.max(0, duLife[i]));
            } else {
                dustPositions.setXYZ(i, 0, -100, 0);
                dustAlpha.setX(i, 0);
            }
        }
        dustParticles.geometry.attributes.position.needsUpdate = true;
        dustParticles.geometry.attributes.alpha.needsUpdate = true;
    }

    function reset() {
        root.position.set(0, 0.01, 0);
        root.rotation.set(0, 0, 0);
        speedRef = 0;
        steerAngle = 0;
        bodyPitch = 0;
        bodyRoll = 0;
    }

    return {
        mesh: root,
        get speedRef() { return speedRef; },
        update,
        reset,
    };
}

// ─── BOX CAR (fallback) ───────────────────────────────────────────────────────
function buildBoxCar(root) {
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x3b6e3b,
        roughness: 0.5,
        metalness: 0.4,
    });
    const detailMat = new THREE.MeshStandardMaterial({
        color: 0x1a2e1a, roughness: 0.7,
    });
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6,
    });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4), bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    root.add(body);

    // Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 1.8), bodyMat);
    cab.position.set(0, 1.1, 0.2);
    cab.castShadow = true;
    root.add(cab);

    // Windshield
    const wind = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), glassMat);
    wind.position.set(0, 1.1, 1.11);
    wind.rotation.x = -0.15;
    root.add(wind);

    // Hood
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.3), bodyMat);
    hood.position.set(0, 0.96, 1.45);
    hood.castShadow = true;
    root.add(hood);

    // Bumper
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.1), detailMat);
    bumper.position.set(0, 0.55, 2.0);
    root.add(bumper);

    // Spare tire (back)
    const spareTire = new THREE.Mesh(
        new THREE.TorusGeometry(0.28, 0.1, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
    );
    spareTire.position.set(0, 0.7, -2.05);
    spareTire.rotation.y = Math.PI / 2;
    root.add(spareTire);

    // Headlights
    const lensGeo = new THREE.CircleGeometry(0.12, 10);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 3 });
    [-0.6, 0.6].forEach(x => {
        const lens = new THREE.Mesh(lensGeo, lensMat.clone());
        lens.position.set(x, 0.6, 2.01);
        root.add(lens);
    });

    return body;
}

// ─── WHEEL MESHES ─────────────────────────────────────────────────────────────
function buildWheels(root) {
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.3, metalness: 0.7 });

    return WHEEL_DEFS.map(def => {
        const g = new THREE.Group();
        g.position.copy(def.offset);

        const tire = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16),
            tireMat
        );
        tire.rotation.z = Math.PI / 2;
        g.add(tire);

        const rim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.22, 0.29, 10),
            rimMat
        );
        rim.rotation.z = Math.PI / 2;
        g.add(rim);

        // Spokes
        for (let i = 0; i < 5; i++) {
            const spoke = new THREE.Mesh(
                new THREE.BoxGeometry(0.04, 0.3, 0.04),
                rimMat
            );
            spoke.rotation.z = (i / 5) * Math.PI * 2;
            g.add(spoke);
        }

        root.add(g);
        return { mesh: g, front: def.front, side: def.side };
    });
}

// ─── EXHAUST PARTICLES ────────────────────────────────────────────────────────
function buildExhaustParticles(scene) {
    const COUNT = 60;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3).fill(-100);
    const alphas = new Float32Array(COUNT).fill(0);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.PointsMaterial({
        color: 0x999999,
        size: 0.35,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    return pts;
}

// ─── DUST PARTICLES ─────────────────────────────────────────────────────────
function buildDustParticles(scene) {
    const COUNT = 80;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3).fill(-100);
    const alphas = new Float32Array(COUNT).fill(0);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.PointsMaterial({
        color: 0xaa8844,
        size: 0.5,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    return pts;
}
