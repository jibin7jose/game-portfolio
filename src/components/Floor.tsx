import React from 'react';
import { usePlane } from '@react-three/cannon';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';

const Floor = () => {
    const [ref] = usePlane(() => ({
        rotation: [-Math.PI / 2, 0, 0],
        position: [0, 0, 0],
    }), React.useRef<THREE.Mesh>(null));

    return (
        <mesh ref={ref} receiveShadow>
            <planeGeometry args={[1000, 1000]} />
            <MeshReflectorMaterial
                blur={[300, 100]}
                resolution={2048}
                mixBlur={1}
                mixStrength={40}
                roughness={1}
                depthScale={1.2}
                minDepthThreshold={0.4}
                maxDepthThreshold={1.4}
                color="#080808"
                metalness={0.5}
                mirror={0}
            />
        </mesh>
    );
};

export default Floor;
