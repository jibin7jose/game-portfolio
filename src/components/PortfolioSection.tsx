import React from 'react';
import { Text, Float, Html } from '@react-three/drei';
import { useBox } from '@react-three/cannon';
import * as THREE from 'three';

interface PortfolioSectionProps {
    position: [number, number, number];
    title: string;
    children: React.ReactNode;
    color?: string;
}

const PortfolioSection: React.FC<PortfolioSectionProps> = ({ position, title, children, color = "#00ff88" }) => {
    const [ref] = useBox(() => ({
        type: 'Static',
        args: [8, 0.5, 8],
        position,
    }), React.useRef<THREE.Group>(null));

    return (
        <group ref={ref}>
            <mesh receiveShadow castShadow>
                <boxGeometry args={[8, 0.5, 8]} />
                <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Decorative border */}
            <mesh position={[0, 0.26, 0]}>
                <boxGeometry args={[8.1, 0.1, 8.1]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
            </mesh>

            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                <Text
                    position={[0, 3, 0]}
                    fontSize={1.2}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                    font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
                >
                    {title}
                </Text>
            </Float>

            <Html
                position={[0, 1.5, 0]}
                transform
                occlude
                distanceFactor={6}
            >
                <div style={{
                    width: '300px',
                    padding: '20px',
                    background: 'rgba(0,0,0,0.8)',
                    borderRadius: '15px',
                    color: 'white',
                    fontSize: '14px',
                    border: `1px solid ${color}`,
                    backdropFilter: 'blur(10px)',
                    pointerEvents: 'none',
                    userSelect: 'none'
                }}>
                    {children}
                </div>
            </Html>
        </group>
    );
};

export default PortfolioSection;
