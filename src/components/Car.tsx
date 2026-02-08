import { useRef, forwardRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRaycastVehicle, useBox } from '@react-three/cannon';
import { useControls } from '../hooks/useControls';
import * as THREE from 'three';

const Car = ({ position = [0, 2, 0] }: { position?: [number, number, number] }) => {
    const controls = useControls();

    const width = 1.2;
    const height = 0.5;
    const length = 2.4;
    const wheelRadius = 0.35;

    const chassisArgs: [number, number, number] = [width, height, length];
    const [chassis, chassisApi] = useBox(
        () => ({
            args: chassisArgs,
            mass: 250,
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
            suspensionStiffness: 35,
            suspensionRestLength: 0.35,
            frictionSlip: 40, // Increased friction
            dampingRelaxation: 2.8,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [0.7, -0.4, 1],
            isFrontWheel: true,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        },
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 35,
            suspensionRestLength: 0.35,
            frictionSlip: 40,
            dampingRelaxation: 2.8,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [-0.7, -0.4, 1],
            isFrontWheel: true,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        },
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 35,
            suspensionRestLength: 0.35,
            frictionSlip: 40,
            dampingRelaxation: 2.8,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [0.7, -0.4, -1],
            isFrontWheel: false,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        },
        {
            radius: wheelRadius,
            directionLocal: [0, -1, 0],
            suspensionStiffness: 35,
            suspensionRestLength: 0.35,
            frictionSlip: 40,
            dampingRelaxation: 2.8,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: [-1, 0, 0],
            chassisConnectionPointLocal: [-0.7, -0.4, -1],
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

    useEffect(() => {
        console.log("3D Car Initialized at:", position);
    }, []);

    useFrame((state) => {
        const { forward, backward, left, right, brake, reset, jump } = controls;

        const force = 50000; // Increased massively
        const steer = 0.5;

        if (reset) {
            chassisApi.position.set(position[0], position[1], position[2]);
            chassisApi.velocity.set(0, 0, 0);
            chassisApi.angularVelocity.set(0, 0, 0);
            chassisApi.rotation.set(0, 0, 0);
            console.log("Physics: Resetting car position.");
        }

        if (jump) {
            const impulse = new THREE.Vector3(0, 500, 0); // Large upward impulse
            chassisApi.applyImpulse(impulse.toArray(), [0, 0, 0]); // Apply at center of mass
            console.log("Physics: Car jumped!");
        }

        // Apply force to all wheels
        const currentForce = forward ? -force : backward ? force : 0;
        for (let i = 0; i < 4; i++) {
            vehicleApi.applyEngineForce(currentForce, i);
        }

        vehicleApi.setSteeringValue(left ? steer : right ? -steer : 0, 0);
        vehicleApi.setSteeringValue(left ? steer : right ? -steer : 0, 1);

        // Very strong brakes
        for (let i = 0; i < 4; i++) {
            vehicleApi.setBrake(brake ? 500 : 0, i);
        }

        // Camera follow
        if (chassis.current) {
            const pos = new THREE.Vector3();
            chassis.current.getWorldPosition(pos);

            const cameraOffset = new THREE.Vector3(12, 10, 12);
            const targetPos = pos.clone().add(cameraOffset);
            state.camera.position.lerp(targetPos, 0.1);
            state.camera.lookAt(pos);

            // Diagnostic: Log position once every 100 frames
            if (state.clock.elapsedTime % 2 < 0.02) {
                // console.log("Car Pos:", pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2));
            }
        }
    });

    return (
        <group ref={vehicle}>
            <group ref={chassis}>
                {/* Car Body - Dynamic color for diagnostic */}
                <mesh castShadow>
                    <boxGeometry args={chassisArgs} />
                    <meshStandardMaterial
                        color={controls.forward ? "#00ff88" : controls.backward ? "#ff0088" : "#3b82f6"}
                        metalness={0.7}
                        roughness={0.2}
                    />
                </mesh>
                <mesh position={[0, 0.4, -0.2]} castShadow>
                    <boxGeometry args={[1, 0.5, 1]} />
                    <meshStandardMaterial
                        color={controls.forward ? "#00ff88" : controls.backward ? "#ff0088" : "#3b82f6"}
                        metalness={0.7}
                        roughness={0.2}
                    />
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
