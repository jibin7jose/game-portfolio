import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export function setupScene(scene, renderer) {
    // ── FOG ──────────────────────────────────────────────────────────────────
    scene.fog = new THREE.FogExp2('#0a1020', 0.0025);
    scene.background = new THREE.Color('#080d18');

    // ── SKY ──────────────────────────────────────────────────────────────────
    const sky = new Sky();
    sky.scale.setScalar(10000);
    scene.add(sky);
    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 8;
    skyUniforms['rayleigh'].value = 0.5;
    skyUniforms['mieCoefficient'].value = 0.003;
    skyUniforms['mieDirectionalG'].value = 0.92;
    const sunDir = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(88);
    const theta = THREE.MathUtils.degToRad(200);
    sunDir.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(sunDir);

    // ── LIGHTS ───────────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x334466, 0.8);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffd0a0, 2.5);
    sun.position.set(-80, 120, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 800;
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    sun.shadow.bias = -0.0003;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x4466aa, 0.6);
    fill.position.set(60, 40, -80);
    scene.add(fill);

    // ── GROUND ───────────────────────────────────────────────────────────────
    buildGround(scene);

    // ── TRACK MARKINGS ───────────────────────────────────────────────────────
    buildTrack(scene);

    // ── ENVIRONMENT PROPS ────────────────────────────────────────────────────
    buildEnvironment(scene);

    // ── STARS ────────────────────────────────────────────────────────────────
    buildStars(scene);
}

// ─── GROUND ─────────────────────────────────────────────────────────────────
function buildGround(scene) {
    // Main terrain — large subdivided plane
    const geo = new THREE.PlaneGeometry(600, 600, 80, 80);
    const pos = geo.attributes.position;

    // Gentle terrain deformation
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getY(i); // y before rotation = z in world
        // Keep center area flat for driving
        const distFromCenter = Math.sqrt(x * x + z * z);
        if (distFromCenter > 60) {
            const bumpScale = (distFromCenter - 60) / 200;
            const h = (Math.sin(x * 0.04) * Math.cos(z * 0.05) + Math.sin(x * 0.01 + z * 0.02)) * 3 * bumpScale;
            pos.setZ(i, h);
        }
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        color: 0x2d3d22,
        roughness: 0.92,
        metalness: 0.01,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── ROAD SURFACE ─────────────────────────────────────────────────────────
    const roadGeo = new THREE.PlaneGeometry(16, 300);
    const roadMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.8,
        metalness: 0.05,
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    scene.add(road);

    // Cross road
    const roadGeo2 = new THREE.PlaneGeometry(300, 16);
    const road2 = new THREE.Mesh(roadGeo2, roadMat.clone());
    road2.rotation.x = -Math.PI / 2;
    road2.position.y = 0.01;
    road2.receiveShadow = true;
    scene.add(road2);
}

// ─── TRACK MARKINGS ─────────────────────────────────────────────────────────
function buildTrack(scene) {
    const lineMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.2,
        roughness: 0.7,
    });
    // Center dashes along Z road
    for (let z = -140; z < 140; z += 10) {
        const geo = new THREE.PlaneGeometry(0.3, 5);
        const mesh = new THREE.Mesh(geo, lineMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, 0.02, z);
        scene.add(mesh);
    }
    // Side lines
    [-7.5, 7.5].forEach(x => {
        for (let z = -140; z < 140; z += 1) {
            const geo = new THREE.PlaneGeometry(0.15, 0.8);
            const mesh = new THREE.Mesh(geo, lineMat.clone());
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(x, 0.02, z);
            scene.add(mesh);
        }
    });
}

// ─── ENVIRONMENT ─────────────────────────────────────────────────────────────
function buildEnvironment(scene) {
    // ── Trees ────────────────────────────────────────────────────────────────
    const treePositions = [];
    const rng = seededRand(42);
    for (let i = 0; i < 120; i++) {
        let x, z;
        do {
            x = (rng() - 0.5) * 500;
            z = (rng() - 0.5) * 500;
        } while (Math.abs(x) < 20 || Math.abs(z) < 20); // avoid road
        treePositions.push([x, z]);
    }
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2d, roughness: 0.85 });
    const leafMatDark = new THREE.MeshStandardMaterial({ color: 0x1f4f1f, roughness: 0.9 });

    treePositions.forEach(([x, z], i) => {
        const h = 4 + rng() * 6;
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.rotation.y = rng() * Math.PI * 2;

        const trunkH = h * 0.4;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.28, trunkH, 6),
            trunkMat
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        g.add(trunk);

        // Layered cone tree
        const mat = i % 3 === 0 ? leafMatDark : leafMat;
        [[0, trunkH + h * 0.25, 0, h * 0.28, h * 0.6],
        [0, trunkH + h * 0.5, 0, h * 0.22, h * 0.5],
        [0, trunkH + h * 0.7, 0, h * 0.14, h * 0.35]].forEach(([lx, ly, lz, r, sh]) => {
            const leaves = new THREE.Mesh(
                new THREE.ConeGeometry(r, sh, 7),
                mat
            );
            leaves.position.set(lx, ly, lz);
            leaves.castShadow = true;
            g.add(leaves);
        });

        scene.add(g);
    });

    // ── Rocks ────────────────────────────────────────────────────────────────
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.95, metalness: 0.05 });
    [[30, 20], [-35, 25], [45, -30], [-20, -40], [60, 10], [-50, -15]].forEach(([x, z]) => {
        const s = 1 + rng() * 2.5;
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(s, 0),
            rockMat
        );
        rock.position.set(x, s * 0.4, z);
        rock.rotation.set(rng() * 2, rng() * 6, rng() * 2);
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
    });

    // ── Military Barriers ───────────────────────────────────────────────────
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xd4a843, roughness: 0.85 });
    [[-20, 0, 0], [20, 0, 0], [-20, 0, 50], [20, 0, 50], [-20, 0, -50], [20, 0, -50]].forEach(([x, y, z]) => {
        const barrier = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 1.5, 3),
            barrierMat
        );
        barrier.position.set(x, 0.75, z);
        barrier.castShadow = true;
        barrier.receiveShadow = true;
        scene.add(barrier);
    });

    // ── Street Lights ─────────────────────────────────────────────────────
    const polePositions = [-80, -50, -20, 10, 40, 70, 100, -110];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.6, metalness: 0.5 });
    const lightGlowMat = new THREE.MeshStandardMaterial({
        color: 0xffffaa,
        emissive: 0xffffaa,
        emissiveIntensity: 2,
    });
    polePositions.forEach(z => {
        [-9, 9].forEach(x => {
            const g = new THREE.Group();
            g.position.set(x, 0, z);

            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.1, 7, 6),
                poleMat
            );
            pole.position.y = 3.5;
            pole.castShadow = true;
            g.add(pole);

            const arm = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 1.5, 4),
                poleMat
            );
            arm.rotation.z = x < 0 ? Math.PI / 2 : -Math.PI / 2;
            arm.position.set(x < 0 ? 0.75 : -0.75, 7, 0);
            g.add(arm);

            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 8, 8),
                lightGlowMat
            );
            bulb.position.set(x < 0 ? 1.5 : -1.5, 7, 0);
            g.add(bulb);

            const ptLight = new THREE.PointLight(0xffffaa, 1.5, 25, 2);
            ptLight.position.set(x < 0 ? 1.5 : -1.5, 7, 0);
            g.add(ptLight);

            scene.add(g);
        });
    });

    // ── Checkpoint Arches ─────────────────────────────────────────────────
    buildCheckpointArch(scene, 0, 0, 0);
    buildCheckpointArch(scene, 0, 0, 80);
    buildCheckpointArch(scene, 0, 0, -80);

    // ── Distant Mountains ─────────────────────────────────────────────────
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.95 });
    [
        [200, 0, 0, 50], [-200, 0, 0, 45], [0, 0, 200, 55],
        [0, 0, -200, 60], [140, 0, 140, 40], [-140, 0, -140, 48],
    ].forEach(([x, , z, s]) => {
        const m = new THREE.Mesh(
            new THREE.ConeGeometry(s, s * 1.6, 8),
            mountainMat
        );
        m.position.set(x, s * 0.5, z);
        scene.add(m);
    });
}

function buildCheckpointArch(scene, x, y, z) {
    const mat = new THREE.MeshStandardMaterial({
        color: 0x00ffcc,
        emissive: 0x00ffcc,
        emissiveIntensity: 0.5,
        roughness: 0.4,
        metalness: 0.6,
    });
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 8, 8);
    const left = new THREE.Mesh(poleGeo, mat);
    left.position.set(x - 8, y + 4, z);
    left.castShadow = true;
    scene.add(left);

    const right = new THREE.Mesh(poleGeo, mat);
    right.position.set(x + 8, y + 4, z);
    right.castShadow = true;
    scene.add(right);

    const top = new THREE.Mesh(
        new THREE.BoxGeometry(16.4, 0.4, 0.4),
        mat
    );
    top.position.set(x, y + 8, z);
    scene.add(top);

    // Glow light
    const light = new THREE.PointLight(0x00ffcc, 2, 20);
    light.position.set(x, y + 6, z);
    scene.add(light);
}

// ─── STARS ───────────────────────────────────────────────────────────────────
function buildStars(scene) {
    const count = 3000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = 800 + Math.random() * 200;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: true });
    scene.add(new THREE.Points(geo, mat));
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function seededRand(seed) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
}
