import { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, Debug } from '@react-three/cannon';
import { Sky, Stars, Environment, Stats } from '@react-three/drei';
import { World } from './components/World.tsx';
import './index.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'p') setDebug(v => !v);
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      {loading && (
        <div className="loading-screen">
          <h1 style={{ letterSpacing: '10px', fontSize: '3rem' }}>JIBIN JOSE</h1>
          <p style={{ marginTop: '10px', color: '#888' }}>Initializing 3D Environment...</p>
          <div className="loading-bar-container">
            <div className="loading-bar" style={{ width: '100%' }}></div>
          </div>
        </div>
      )}

      <Canvas
        shadows
        camera={{ position: [20, 20, 20], fov: 45 }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <Sky sunPosition={[100, 20, 100]} />
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[10, 20, 10]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <Physics gravity={[0, -9.81, 0]} tolerance={0.001}>
            {debug ? (
              <Debug color="white" scale={1.1}>
                <World />
              </Debug>
            ) : (
              <World />
            )}
          </Physics>
          <Environment preset="city" />
          <Stats />
        </Suspense>
      </Canvas>

      <div className="instructions">
        <div className="instruction-item">
          <span className="key">WASD</span> or <span className="key">ARROWS</span> Drive
        </div>
        <div className="instruction-item">
          <span className="key">SPACE</span> Brake
        </div>
        <div className="instruction-item">
          <span className="key">R</span> Reset
        </div>
        <div className="instruction-item">
          <span className="key">P</span> Debug Mode
        </div>
      </div>
    </div>
  );
}

export default App;
