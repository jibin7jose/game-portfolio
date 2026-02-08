import { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { Sky, Stars, Environment } from '@react-three/drei';
import { World } from './components/World.tsx';
import './index.css';

function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {loading && (
        <div className="loading-screen">
          <h1>JIBIN JOSE</h1>
          <p>Portfolio Game Engine Loading...</p>
          <div className="loading-bar-container">
            <div className="loading-bar" style={{ width: '100%' }}></div>
          </div>
        </div>
      )}

      <Canvas
        shadows
        camera={{ position: [10, 10, 10], fov: 40 }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <Sky sunPosition={[100, 20, 100]} />
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[10, 20, 10]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <Physics gravity={[0, -9.81, 0]}>
            <World />
          </Physics>
          <Environment preset="city" />
        </Suspense>
      </Canvas>

      <div className="instructions">
        <div className="instruction-item">
          <span className="key">WASD</span> or <span className="key">ARROWS</span> to Drive
        </div>
        <div className="instruction-item">
          <span className="key">SPACE</span> to Break
        </div>
        <div className="instruction-item">
          <span className="key">R</span> to Reset
        </div>
      </div>
    </div>
  );
}

export default App;
