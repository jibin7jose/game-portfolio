import { useRef, forwardRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRaycastVehicle, useBox } from '@react-three/cannon';
import { useControls } from '../hooks/useControls';
import * as THREE from 'three';

const Car = ({ position = [0, 2, 0] }: { position?: [number, number, number] }) => {
    const controls = useControls();

    const width = 1.2;
    const height = 0.5;
    const front = 1.0;
    const wheelRadius = 0.35;

    const chassisArgs: [number, number, number] = [width, height, front * 2];
    const [chassis, chassisApi] = useBox(
        () => ({
            args: chassisArgs,
            mass: 500,
            position: position as [number, number, number],
        }),
        useRef<THREE.Group>(null)
    );

    const wheels = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];

    const wheelInfos: any[] = [
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 5,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [1, 0, 1],
            isFrontWheel: true,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        },
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 5,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [-1, 0, 1],
            isFrontWheel: true,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        },
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 5,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [1, 0, -1],
            isFrontWheel: false,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        },
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 5,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [-1, 0, -1],
            isFrontWheel: false,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
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

        const force = 1500;
        const steer = 0.5;

        if (reset) {
            chassisApi.position.set(position[0], position[1], position[2]);
            chassisApi.velocity.set(0, 0, 0);
            chassisApi.angularVelocity.set(0, 0, 0);
            chassisApi.rotation.set(0, 0, 0);
        }

        vehicleApi.applyEngineForce(forward ? -force : backward ? force : 0, 2);
        vehicleApi.applyEngineForce(forward ? -force : backward ? force : 0, 3);

        vehicleApi.setSteeringValue(left ? steer : right ? -steer : 0, 0);
        vehicleApi.setSteeringValue(left ? steer : right ? -steer : 0, 1);

        vehicleApi.setBrake(brake ? 100 : 0, 2);
        vehicleApi.setBrake(brake ? 100 : 0, 3);

        // Camera follow
        if (chassis.current) {
            const pos = new THREE.Vector3();
            chassis.current.getWorldPosition(pos);

            const targetPos = new THREE.Vector3(pos.x + 10, pos.y + 10, pos.z + 10);
            state.camera.position.lerp(targetPos, 0.1);
            state.camera.lookAt(pos);
        }
    });

    return (
        <group ref={vehicle}>
            <group ref={chassis}>
                {/* Car Body */}
                <mesh castShadow>
                    <boxGeometry args={chassisArgs} />
                    <meshStandardMaterial color="#00ff88" metalness={0.7} roughness={0.2} />
                </mesh>
                <mesh position={[0, 0.4, -0.2]} castShadow>
                    <boxGeometry args={[1, 0.5, 1]} />
                    <meshStandardMaterial color="#00ff88" metalness={0.7} roughness={0.2} />
                </mesh>
                {/* Windshield */}
                <mesh position={[0, 0.5, 0.3]} rotation={[-0.5, 0, 0]}>
                    <planeGeometry args={[0.9, 0.5]} />
                    <meshPhysicalMaterial color="#ffffff" transparent opacity={0.6} />
                </mesh>
            </group>

            {/* Wheels */}
            {wheelInfos.map((_, index) => (
                <Wheel key={index} ref={wheels[index]} radius={wheelRadius} />
            ))}
        </group>
    );
};

const Wheel = forwardRef<THREE.Group, { radius: number }>(({ radius }, ref) => {
    return (
        <group ref={ref}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[radius, radius, 0.3, 16]} />
                <meshStandardMaterial color="#222" />
            </mesh>
        </group>
    );
});

export default Car;
