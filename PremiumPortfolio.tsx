import React, { useState, useRef, Suspense, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Float, Environment, ContactShadows, OrbitControls, PerspectiveCamera, Stars, MeshWobbleMaterial, useTexture, MeshDistortMaterial, Loader, useScroll } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Vignette, Glitch } from '@react-three/postprocessing';
import * as THREE from 'three';

let audioCtx: AudioContext | null = null;

const playSound = (type: 'hover' | 'click') => {
  if (typeof window === 'undefined') return;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (!audioCtx) return;
  
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  const now = audioCtx.currentTime;
  
  if (type === 'hover') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.2);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }
};

function CameraRig({ start, section }: { start: boolean, section: number }) {
  useFrame((state) => {
    // Smoothly move camera: Zoom in if started, stay back if not
    let targetZ = start ? 6 : 14;
    if (start && section === 1) targetZ = 9; // Pull back further for projects view

    const targetY = start ? section * -12 : 0;
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetZ, 0.02);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY, 0.02);
    state.camera.lookAt(0, targetY, 0);
  });
  return null;
}

function InteractiveStars() {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, state.mouse.y * 0.2, 0.05);
      ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, state.mouse.x * 0.2, 0.05);
    }
  });
  return (
    <group ref={ref}>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
    </group>
  );
}

function FloatingCrystals() {
  return (
    <>
      <Float speed={2} rotationIntensity={2} floatIntensity={2} position={[-6, 0, -2]}>
        <mesh castShadow receiveShadow>
          <icosahedronGeometry args={[1, 0]} />
          <MeshDistortMaterial color="#00ffff" roughness={0.1} metalness={0.9} emissive="#00ffff" emissiveIntensity={0.5} distort={0.3} speed={2} />
        </mesh>
      </Float>
      <Float speed={3} rotationIntensity={2} floatIntensity={1.5} position={[6, 1, -3]}>
        <mesh castShadow receiveShadow>
          <octahedronGeometry args={[1, 0]} />
          <MeshDistortMaterial color="#ff00ff" roughness={0.1} metalness={0.9} emissive="#ff00ff" emissiveIntensity={0.5} distort={0.4} speed={3} />
        </mesh>
      </Float>
      <Float speed={1.5} rotationIntensity={1.5} floatIntensity={2} position={[0, -3, 2]}>
        <mesh castShadow receiveShadow>
          <torusKnotGeometry args={[0.5, 0.15, 100, 16]} />
          <MeshDistortMaterial color="#ffff00" roughness={0.1} metalness={0.9} emissive="#ffff00" emissiveIntensity={0.5} distort={0.2} speed={4} />
        </mesh>
      </Float>
    </>
  );
}

function Explosion({ position, color, onComplete }: { position: [number, number, number], color: string, onComplete: () => void }) {
  const group = useRef<THREE.Group>(null);
  const [particles] = useState(() => new Array(20).fill(0).map(() => ({
    velocity: [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5].map(v => v * 8),
    position: [0, 0, 0]
  })));

  useFrame((_, delta) => {
    if (group.current) {
      let active = false;
      group.current.children.forEach((mesh, i) => {
        const p = particles[i];
        mesh.position.x += p.velocity[0] * delta;
        mesh.position.y += p.velocity[1] * delta;
        mesh.position.z += p.velocity[2] * delta;
        const material = mesh.material as THREE.MeshBasicMaterial;
        material.opacity -= delta * 2;
        if (material.opacity > 0) active = true;
      });
      if (!active) onComplete();
    }
  });

  return (
    <group position={position} ref={group}>
      {particles.map((_, i) => (
        <mesh key={i}>
          <dodecahedronGeometry args={[0.08, 0]} />
          <meshBasicMaterial color={color} transparent opacity={1} />
        </mesh>
      ))}
    </group>
  );
}

function SkillsRing() {
  const ref = useRef<THREE.Group>(null);
  const skills = ["REACT", "NEXT.JS", "TYPESCRIPT", "NODE.JS", "LARAVEL", "POSTGRESQL", "TAILWIND", "AWS"];
  
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <group ref={ref} position={[0, 2.5, 0]} rotation={[0.1, 0, 0]}>
      {skills.map((skill, i) => {
        const angle = (i / skills.length) * Math.PI * 2;
        const radius = 7;
        return (
          <group key={i} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]} rotation={[0, -angle - Math.PI / 2, 0]}>
             <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
              <Text
                fontSize={0.6}
                font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
                anchorX="center"
                anchorY="middle"
              >
                {skill}
                <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} toneMapped={false} />
              </Text>
            </Float>
          </group>
        );
      })}
    </group>
  );
}

function ProjectCard({ position, color, title, image, onClick }: { position: [number, number, number], color: string, title: string, image: string, onClick: (pos: THREE.Vector3) => void }) {
  const [hovered, setHover] = useState(false);
  const texture = useTexture(image);
  const meshRef = useRef<THREE.Group>(null);
  
  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5} position={position}>
      <group 
        ref={meshRef}
        onPointerOver={() => { setHover(true); playSound('hover'); }} 
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          playSound('click');
          const worldPos = new THREE.Vector3();
          meshRef.current?.getWorldPosition(worldPos);
          onClick(worldPos);
        }}
        scale={hovered ? 1.1 : 1}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.5, 3.5, 0.2]} />
          <meshStandardMaterial color="#222" roughness={0.5} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.11]}>
          {/* Increased segments for smoother wobble effect */}
          <planeGeometry args={[2.3, 3.3, 32, 32]} />
          <MeshWobbleMaterial 
            map={texture}
            color={color} 
            emissive={color} 
            emissiveIntensity={hovered ? 0.8 : 0.2} 
            toneMapped={false}
            factor={hovered ? 0.3 : 0} 
            speed={hovered ? 5 : 0}
          />
        </mesh>
        <Text
          position={[0, -1.2, 0.12]}
          fontSize={0.25}
          color="white"
          anchorX="center"
          anchorY="middle"
          font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
        >
          {title}
        </Text>
      </group>
    </Float>
  );
}

export default function PremiumPortfolio() {
  const [start, setStart] = useState(false);
  const [selectedProject, setSelectedProject] = useState<{title: string, color: string, description: string} | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [explosions, setExplosions] = useState<{id: number, position: [number, number, number], color: string}[]>([]);
  const [glitch, setGlitch] = useState(false);
  const [section, setSection] = useState(0);

  return (
    <div style={{ width: '100%', height: '100vh', background: '#000' }}>
      <Loader />
      
      {/* Project Details Modal */}
      {selectedProject && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.85)', zIndex: 20, display: 'flex',
          alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)'
        }} onClick={() => setSelectedProject(null)}>
          <div style={{
            background: '#111', border: `1px solid ${selectedProject.color}`,
            padding: '40px', maxWidth: '500px', borderRadius: '8px',
            boxShadow: `0 0 50px ${selectedProject.color}40`
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: selectedProject.color, fontSize: '2.5rem', marginBottom: '1rem', fontFamily: 'sans-serif' }}>
              {selectedProject.title}
            </h2>
            <p style={{ color: '#ccc', lineHeight: '1.6', fontSize: '1.1rem' }}>
              {selectedProject.description}
            </p>
            <button style={{
              marginTop: '2rem', padding: '10px 30px', background: selectedProject.color,
              border: 'none', fontWeight: 'bold', cursor: 'pointer'
            }} onClick={() => setSelectedProject(null)}>
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContact && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.9)', zIndex: 25, display: 'flex',
          alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)'
        }} onClick={() => setShowContact(false)}>
          <div style={{
            textAlign: 'center', color: 'white', fontFamily: 'sans-serif'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '3rem', marginBottom: '2rem', letterSpacing: '5px' }}>GET IN TOUCH</h2>
            <p style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#aaa' }}>jibinjose884@gmail.com</p>
            <p style={{ fontSize: '1.5rem', marginBottom: '3rem', color: '#aaa' }}>+91-7994279661</p>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
              {['LINKEDIN', 'GITHUB', 'PORTFOLIO'].map(social => (
                <button key={social} style={{
                  padding: '10px 20px', background: 'transparent', border: '1px solid #fff',
                  color: '#fff', cursor: 'pointer', letterSpacing: '2px'
                }} onClick={() => {
                  const links: any = { LINKEDIN: "https://www.linkedin.com/in/jibin--jose", GITHUB: "https://github.com/jibin7jose", PORTFOLIO: "https://portfolio-pi-cyan-64.vercel.app" };
                  window.open(links[social], '_blank');
                  playSound('click');
                }}>
                  {social}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* UI Overlay */}
      <div style={{
        position: 'absolute', 
        bottom: '15%', 
        left: '50%', 
        transform: 'translateX(-50%)', 
        zIndex: 10,
        display: 'flex',
        gap: '20px'
      }}>
        {!start && (
        <button 
          onClick={() => {
            setStart(true);
            playSound('click');
          }}
          onMouseEnter={() => playSound('hover')}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.5)',
            color: 'white',
            padding: '15px 40px',
            fontSize: '1.2rem',
            letterSpacing: '4px',
            cursor: 'pointer',
            textTransform: 'uppercase'
          }}
        >
          Enter Experience
        </button>
        )}

        {start && (
          <>
            <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '20px' }}>
              {['SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION', 'CONTACT'].map((item, index) => (
                <button 
                  key={item}
                  onClick={() => { setSection(index); playSound('click'); }}
                  onMouseEnter={() => playSound('hover')}
                  style={{
                    background: section === index ? 'white' : 'transparent', color: section === index ? 'black' : 'white',
                    border: '1px solid white', padding: '8px 20px', cursor: 'pointer', letterSpacing: '2px', fontSize: '0.8rem'
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            <button 
              onClick={() => { setStart(false); playSound('click'); }}
              onMouseEnter={() => playSound('hover')}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.5)',
                color: 'white', padding: '10px 30px', fontSize: '1rem',
                letterSpacing: '2px', cursor: 'pointer', textTransform: 'uppercase'
              }}
            >
              Back
            </button>
            <button 
              onClick={() => { setShowContact(true); playSound('click'); }}
              onMouseEnter={() => playSound('hover')}
              style={{
                background: 'white', border: '1px solid white',
                color: 'black', padding: '10px 30px', fontSize: '1rem',
                letterSpacing: '2px', cursor: 'pointer', textTransform: 'uppercase',
                fontWeight: 'bold'
              }}
            >
              Contact
            </button>
          </>
        )}
      </div>

      <Canvas gl={{ antialias: false, toneMapping: THREE.ReinhardToneMapping, toneMappingExposure: 1.5 }}>
        <PerspectiveCamera makeDefault position={[0, 0, 14]} fov={50} />
        <color attach="background" args={['#050505']} />

        <CameraRig start={start} section={section} />

        {/* Scene Lighting */}
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={10} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={2} color="#4400ff" />
        
        {/* Environment Reflections */}
        <Environment preset="city" />

        {/* Background Stars */}
        <InteractiveStars />

        {/* Skills Ring (Visible when started) */}
        {start && <SkillsRing />}

        {/* Floating Game Elements */}
        <FloatingCrystals />

        {/* Particle Explosions */}
        {explosions.map(ex => (
          <Explosion 
            key={ex.id} 
            position={ex.position} 
            color={ex.color}
            onComplete={() => setExplosions(prev => prev.filter(e => e.id !== ex.id))} 
          />
        ))}

        {/* New scene sections that are navigated to */}
        {start && (
          <>
            <SkillsRing />
            <Projects 
              onSelect={setSelectedProject} 
              onExplode={(pos, color) => setExplosions(prev => [...prev, { id: Date.now(), position: [pos.x, pos.y, pos.z], color }])}
            />
            <Experience />
            <Education />
            <ContactSection />
          </>
        )}

        {/* Floating Hero Text */}
        <Float speed={2} rotationIntensity={0.5} floatIntensity={1} position={[0, start ? 6 : 0, 0]}>
          <Text
            font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
            fontSize={2}
            color="white"
            anchorX="center"
            anchorY="middle"
            position={[0, 1, 0]}
            onPointerOver={() => setGlitch(true)}
            onPointerOut={() => setGlitch(false)}
          >
            JIBIN JOSE
            {/* Emissive material makes it glow with Bloom */}
            <meshStandardMaterial 
              color="white" 
              emissive="white" 
              emissiveIntensity={2} 
              toneMapped={false} 
            />
          </Text>
          
          <Text
            fontSize={0.5}
            color="#888"
            anchorX="center"
            anchorY="middle"
            position={[0, -1, 0]}
          >
            FULL STACK DEV
          </Text>
        </Float>

        {/* Shadows */}
        <ContactShadows resolution={1024} scale={50} blur={2} opacity={0.5} far={10} color="#000" />

        {/* Post Processing Effects for "Ultra" look */}
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={1} mipmapBlur intensity={1.5} radius={0.6} />
          <ChromaticAberration offset={[0.002, 0.002]} />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
          <Glitch 
            delay={[1.5, 3.5]} 
            duration={[0.6, 1.0]} 
            strength={[0.3, 1.0]} 
            active={glitch} 
            ratio={0.85}
          />
        </EffectComposer>

        <OrbitControls enableZoom={false} autoRotate={!start} autoRotateSpeed={0.5} enablePan={false} />
      </Canvas>
    </div>
  );
}

function Projects({ onSelect, onExplode }: { onSelect: (data: any) => void, onExplode: (pos: THREE.Vector3, color: string) => void }) {
  return (
    <group position={[0, -0.5, 0]}>
      <Suspense fallback={null}>
        <ProjectCard 
          position={[-5.25, -12, 0]} 
          color="#ff0055" 
          title="OUTBREAK FPS" 
          image="https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=500&q=60"
          onClick={(pos) => {
            onExplode(pos, "#ff0055");
            onSelect({
              title: "OUTBREAK FPS", 
              color: "#ff0055", 
              description: "An immersive First-Person Shooter game developed using Unreal Engine and C++."
            });
          }}
        />
        <ProjectCard 
          position={[-1.75, -12, 0]} 
          color="#00aaff" 
          title="SOLIDSERVE" 
          image="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=500&q=60"
          onClick={(pos) => {
            onExplode(pos, "#00aaff");
            onSelect({
              title: "SOLIDSERVE", 
              color: "#00aaff", 
              description: "CRUD-based web app for Akshaya centers featuring invoice generation and wallet management."
            });
          }}
        />
        <ProjectCard 
          position={[1.75, -12, 0]} 
          color="#00ff88" 
          title="BELMOUNTIE" 
          image="https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=500&q=60"
          onClick={(pos) => {
            onExplode(pos, "#00ff88");
            onSelect({
              title: "BELMOUNTIE", 
              color: "#00ff88", 
              description: "A responsive furniture e-commerce website with product listings and admin dashboard."
            });
          }}
        />
        <ProjectCard 
          position={[5.25, -12, 0]} 
          color="#ffcc00" 
          title="FIG" 
          image="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=500&q=60"
          onClick={(pos) => {
            onExplode(pos, "#ffcc00");
            onSelect({
              title: "FIG", 
              color: "#ffcc00", 
              description: "Directory-based platform allowing users to register, create profiles, and list services."
            });
          }}
        />
      </Suspense>
    </group>
  );
}

function ExperienceItem({ position, role, company, date, color }: { position: [number, number, number], role: string, company: string, date: string, color: string }) {
  const [hovered, setHover] = useState(false);
  return (
    <Float speed={1} rotationIntensity={0.1} floatIntensity={0.2} position={position}>
      <group 
        onPointerOver={() => setHover(true)} 
        onPointerOut={() => setHover(false)}
        scale={hovered ? 1.05 : 1}
      >
        <mesh receiveShadow castShadow>
          <boxGeometry args={[7, 1.5, 0.1]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.2} metalness={0.8} />
        </mesh>
        <mesh position={[-3.4, 0, 0.06]}>
           <capsuleGeometry args={[0.1, 1.2, 4, 8]} />
           <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 2 : 1} toneMapped={false} />
        </mesh>
        <Text position={[-3, 0.3, 0.1]} fontSize={0.4} anchorX="left" color="white" font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff">
          {role}
        </Text>
        <Text position={[-3, -0.2, 0.1]} fontSize={0.25} anchorX="left" color="#aaa" font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff">
          {company}
        </Text>
        <Text position={[3.2, 0, 0.1]} fontSize={0.2} anchorX="right" color="#666" font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff">
          {date}
        </Text>
      </group>
    </Float>
  )
}

function Experience() {
  return (
    <group position={[0, -24, 0]}>
      <Suspense fallback={null}>
        <Text
          font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
          fontSize={1}
          color="white"
          anchorX="center"
          anchorY="middle"
          position={[0, 2.5, 0]}
        >
          EXPERIENCE
          {/* Emissive material makes it glow with Bloom */}
          <meshStandardMaterial 
            color="white" 
            emissive="white" 
            emissiveIntensity={0.5} 
            toneMapped={false} 
          />
        </Text>
        <ExperienceItem position={[0, 0, 0]} role="Software Engineer" company="ABHRAM TECHNOLOGIES" date="Nov 2025 - Present" color="#00ff88" />
        <ExperienceItem position={[0, -2, 0]} role="Jr. Software Dev" company="MDigitz" date="Jul 2025 - Oct 2025" color="#00aaff" />
        <ExperienceItem position={[0, -4, 0]} role="Full Stack Intern" company="Edu-versity" date="Mar 2025 - Jun 2025" color="#ff0055" />
      </Suspense>
    </group>
  );
}

function EducationItem({ position, degree, institution, date, color }: { position: [number, number, number], degree: string, institution: string, date: string, color: string }) {
  const [hovered, setHover] = useState(false);
  return (
    <Float speed={1} rotationIntensity={0.1} floatIntensity={0.2} position={position}>
      <group 
        onPointerOver={() => setHover(true)} 
        onPointerOut={() => setHover(false)}
        scale={hovered ? 1.05 : 1}
      >
        <mesh receiveShadow castShadow>
          <boxGeometry args={[7, 1.5, 0.1]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.2} metalness={0.8} />
        </mesh>
        <mesh position={[-3.4, 0, 0.06]}>
           <capsuleGeometry args={[0.1, 1.2, 4, 8]} />
           <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 2 : 1} toneMapped={false} />
        </mesh>
        <Text position={[-3, 0.3, 0.1]} fontSize={0.35} anchorX="left" color="white" font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff">
          {degree}
        </Text>
        <Text position={[-3, -0.2, 0.1]} fontSize={0.25} anchorX="left" color="#aaa" font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff">
          {institution}
        </Text>
        <Text position={[3.2, 0, 0.1]} fontSize={0.2} anchorX="right" color="#666" font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff">
          {date}
        </Text>
      </group>
    </Float>
  )
}

function Education() {
  return (
    <group position={[0, -36, 0]}>
      <Suspense fallback={null}>
        <Text
          font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
          fontSize={1}
          color="white"
          anchorX="center"
          anchorY="middle"
          position={[0, 2.5, 0]}
        >
          EDUCATION
          <meshStandardMaterial 
            color="white" 
            emissive="white" 
            emissiveIntensity={0.5} 
            toneMapped={false} 
          />
        </Text>
        <EducationItem position={[0, 0, 0]} degree="B.Tech in CSE" institution="University College of Engineering" date="2021 - 2025" color="#ff9900" />
        <EducationItem position={[0, -2, 0]} degree="Higher Secondary" institution="SAHSS Kalloorkad" date="2019 - 2021" color="#00ccff" />
        <EducationItem position={[0, -4, 0]} degree="MERN Fullstack Guide" institution="Udemy Certification" date="Jun 2024" color="#ff0055" />
      </Suspense>
    </group>
  );
}

function ContactSection() {
  const [hovered, setHover] = useState<string | null>(null);
  
  const SocialButton = ({ position, color, label, link }: { position: [number, number, number], color: string, label: string, link: string }) => (
    <group position={position} 
      onPointerOver={() => { setHover(label); document.body.style.cursor = 'pointer'; playSound('hover'); }} 
      onPointerOut={() => { setHover(null); document.body.style.cursor = 'auto'; }}
      onClick={() => { window.open(link, '_blank'); playSound('click'); }}
    >
      <mesh>
        <sphereGeometry args={[0.6, 32, 32]} />
        <MeshDistortMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={hovered === label ? 2 : 0.5} 
          distort={hovered === label ? 0.4 : 0} 
          speed={5} 
        />
      </mesh>
      <Text position={[0, -1.2, 0]} fontSize={0.3} color="white" anchorX="center" font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff">
        {label}
      </Text>
    </group>
  );

  return (
    <group position={[0, -48, 0]}>
      <Text fontSize={1.5} position={[0, 2, 0]} anchorX="center" font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff">
        GET IN TOUCH
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
      </Text>
      <group position={[0, -1, 0]}>
        <SocialButton position={[-3, 0, 0]} color="#0077B5" label="LinkedIn" link="https://www.linkedin.com/in/jibin--jose" />
        <SocialButton position={[0, 0, 0]} color="#333" label="GitHub" link="https://github.com/jibin7jose" />
        <SocialButton position={[3, 0, 0]} color="#E1306C" label="Portfolio" link="https://portfolio-pi-cyan-64.vercel.app" />
      </group>
    </group>
  );
}