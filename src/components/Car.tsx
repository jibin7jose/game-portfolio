import { useRef, useMemo, Suspense, forwardRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRaycastVehicle, useBox } from '@react-three/cannon';
import { useControls } from '../hooks/useControls';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const Wheel = forwardRef<THREE.Group, { radius: number }>(({ radius }, ref) => {
    return (
        <group ref={ref}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[radius, radius, 0.2, 24]} />
                <meshStandardMaterial color="#222" metalness={0.5} roughness={0.8} />
            </mesh>
            {/* Rim detail */}
            <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[radius * 0.7, radius * 0.7, 0.21, 12]} />
                <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={0.5} />
            </mesh>
        </group>
    );
});

const BoxCar = () => (
    <mesh castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.5, 2.4]} />
        <meshStandardMaterial color="#00ff88" metalness={0.8} roughness={0.2} />
    </mesh>
);

const CarModel = ({ modelUrl }: { modelUrl: string }) => {
    const { scene } = useGLTF(modelUrl);

    const copiedScene = useMemo(() => {
        const clone = scene.clone();
        clone.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.name.toLowerCase().includes('wheel') || child.name.toLowerCase().includes('tire')) {
                    child.visible = false;
                }
            }
        });
        return clone;
    }, [scene]);

    // Scale 1.4 for typical GLB car models to fit 2.4m length
    return <primitive object={copiedScene} scale={1.4} position={[0, -0.4, 0]} rotation={[0, Math.PI, 0]} />;
};

const Car = ({ position = [0, 2, 0] }: { position?: [number, number, number] }) => {
    const controls = useControls();

    // Physics dimensions
    const width = 1.2;
    const height = 0.5;
    const length = 2.4;
    const wheelRadius = 0.35;

    const [chassis, chassisApi] = useBox(
        () => ({
            args: [width, height, length],
            mass: 500, // Heavier for better stability
            position: position as [number, number, number],
            allowSleep: false,
        }),
        useRef<THREE.Group>(null)
    );

    const wheels = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];

    const wheelInfos: any[] = [
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 40,
            suspensionRestLength: 0.3,
            frictionSlip: 30,
            dampingRelaxation: 2.5,
            dampingCompression: 4.5,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [0.7, -0.2, 1],
            isFrontWheel: true,
        },
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 40,
            suspensionRestLength: 0.3,
            frictionSlip: 30,
            dampingRelaxation: 2.5,
            dampingCompression: 4.5,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [-0.7, -0.2, 1],
            isFrontWheel: true,
        },
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 40,
            suspensionRestLength: 0.3,
            frictionSlip: 30,
            dampingRelaxation: 2.5,
            dampingCompression: 4.5,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [0.7, -0.2, -1],
            isFrontWheel: false,
        },
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 40,
            suspensionRestLength: 0.3,
            frictionSlip: 30,
            dampingRelaxation: 2.5,
            dampingCompression: 4.5,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [-0.7, -0.2, -1],
            isFrontWheel: false,
        },
    ];

    const [vehicle, vehicleApi] = useRaycastVehicle(
        () => ({
            chassisBody: chassis as any,
            wheelInfos,
            wheels,
        }),
        useRef<THREE.Group>(null)
    );

    useFrame((state) => {
        const { forward, backward, left, right, brake, reset } = controls;
        const force = 3000; // Adjusted force for 500kg mass
        const steer = 0.4;

        if (reset) {
            chassisApi.position.set(position[0], position[1], position[2]);
            chassisApi.velocity.set(0, 0, 0);
            chassisApi.angularVelocity.set(0, 0, 0);
            chassisApi.rotation.set(0, 0, 0);
        }

        const currentForce = forward ? -force : backward ? force : 0;
        for (let i = 0; i < 4; i++) {
            vehicleApi.applyEngineForce(currentForce, i);
        }

        vehicleApi.setSteeringValue(left ? steer : right ? -steer : 0, 0);
        vehicleApi.setSteeringValue(left ? steer : right ? -steer : 1, 1);

        for (let i = 0; i < 4; i++) {
            vehicleApi.setBrake(brake ? 50 : 0, i);
        }

        if (chassis.current) {
            const pos = new THREE.Vector3();
            chassis.current.getWorldPosition(pos);
            const cameraOffset = new THREE.Vector3(12, 10, 12);
            state.camera.position.lerp(pos.clone().add(cameraOffset), 0.1);
            state.camera.lookAt(pos);
        }
    });

    return (
        <group ref={vehicle}>
            <group ref={chassis}>
                <Suspense fallback={<BoxCar />}>
                    <CarModel modelUrl="/2015_bmw_m3_f80.glb" />
                </Suspense>
            </group>
            {wheelInfos.map((_, index) => (
                <Wheel key={index} ref={wheels[index]} radius={wheelRadius} />
            ))}
        </group>
    );
};

export default Car;
