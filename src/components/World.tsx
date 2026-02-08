import * as THREE from 'three';
import Floor from './Floor';
import Car from './Car';
import PortfolioSection from './PortfolioSection';
import { Text, Center } from '@react-three/drei';

export const World = () => {
    return (
        <>
            <Floor />
            <Car position={[0, 2, 0]} />

            {/* Intro Section */}
            <group position={[0, 0, -10]}>
                <Center top position={[0, 1, 0]}>
                    <Text
                        fontSize={4}
                        color="#00ff88"
                        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
                    >
                        JIBIN JOSE
                    </Text>
                </Center>
                <Text
                    position={[0, 0.5, 3]}
                    fontSize={1}
                    color="white"
                >
                    Frontend Developer | Game Dev Enthusiast
                </Text>
                <Text
                    position={[0, 0, 5]}
                    fontSize={0.5}
                    color="#aaa"
                >
                    Drive to explore my journey
                </Text>
            </group>

            {/* Experience Section */}
            <PortfolioSection position={[15, 0.25, -15]} title="Experience" color="#3b82f6">
                <div>
                    <h3 style={{ color: '#3b82f6' }}>Software Engineer</h3>
                    <p>ABHRAM TECHNOLOGIES</p>
                    <p style={{ fontSize: '10px', color: '#888' }}>Nov 2025 - Present</p>
                    <ul style={{ paddingLeft: '15px', marginTop: '5px' }}>
                        <li>React Native, Next.js, NestJS</li>
                        <li>Prisma, PostgreSQL, AWS</li>
                    </ul>

                    <h3 style={{ color: '#3b82f6', marginTop: '10px' }}>Junior Dev Trainee</h3>
                    <p>MDigitz</p>
                    <p style={{ fontSize: '10px', color: '#888' }}>July 2025 - Oct 2025</p>
                </div>
            </PortfolioSection>

            {/* Skills Section */}
            <PortfolioSection position={[-15, 0.25, -15]} title="Skills" color="#f59e0b">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                    <div>
                        <h4 style={{ color: '#f59e0b' }}>Languages</h4>
                        <div style={{ fontSize: '11px' }}>JS, TS, C++, Java, PHP</div>
                    </div>
                    <div>
                        <h4 style={{ color: '#f59e0b' }}>Frontend</h4>
                        <div style={{ fontSize: '11px' }}>React, Next.js, Tailwind</div>
                    </div>
                    <div>
                        <h4 style={{ color: '#f59e0b' }}>Backend</h4>
                        <div style={{ fontSize: '11px' }}>Node, NestJS, Laravel</div>
                    </div>
                    <div>
                        <h4 style={{ color: '#f59e0b' }}>Tools</h4>
                        <div style={{ fontSize: '11px' }}>Git, AWS, Figma</div>
                    </div>
                </div>
            </PortfolioSection>

            {/* Projects Section */}
            <PortfolioSection position={[15, 0.25, 15]} title="Projects" color="#ef4444">
                <div>
                    <h3 style={{ color: '#ef4444' }}>OUTBREAK FPS</h3>
                    <p style={{ fontSize: '11px' }}>Unreal Engine first-person shooter game.</p>

                    <h3 style={{ color: '#ef4444', marginTop: '10px' }}>SOLIDSERVE</h3>
                    <p style={{ fontSize: '11px' }}>CRUD application for Akshaya centers.</p>

                    <h3 style={{ color: '#ef4444', marginTop: '10px' }}>FIG</h3>
                    <p style={{ fontSize: '11px' }}>User directory listing platform.</p>
                </div>
            </PortfolioSection>

            {/* Contact Section */}
            <PortfolioSection position={[-15, 0.25, 15]} title="Contact" color="#a855f7">
                <div style={{ textAlign: 'center' }}>
                    <p>📧 jibinjose884@gmail.com</p>
                    <p>📞 +91-7994279661</p>
                    <p>📍 Muvattupuzha, India</p>
                    <hr style={{ margin: '10px 0', borderColor: '#a855f755' }} />
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                        <span>GitHub</span> | <span>LinkedIn</span>
                    </div>
                </div>
            </PortfolioSection>

            {/* Background decorations */}
            <mesh position={[0, -5, 0]}>
                <sphereGeometry args={[100, 32, 32]} />
                <meshStandardMaterial color="#050505" side={THREE.BackSide} />
            </mesh>
        </>
    );
};
