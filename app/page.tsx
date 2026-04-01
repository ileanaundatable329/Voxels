'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

// --- Voxel Generator ---
let globalEarthData: ImageData | null = null;
let earthDataCallbacks: ((data: ImageData) => void)[] = [];

const planetCache: Record<string, { position: [number, number, number]; color: THREE.Color }[]> = {};

if (typeof window !== 'undefined') {
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/textures/planets/earth_atmos_2048.jpg";
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, 512, 256);
      globalEarthData = ctx.getImageData(0, 0, 512, 256);
      earthDataCallbacks.forEach(cb => cb(globalEarthData!));
      earthDataCallbacks = [];
    }
  };
}

const generatePlanet = (type: string, seed: number, isMobile: boolean, earthData: ImageData | null = null) => {
  const cacheKey = `${type}-${isMobile}-${earthData ? 'loaded' : 'unloaded'}`;
  if (planetCache[cacheKey]) return planetCache[cacheKey];

  const noise3D = createNoise3D(() => seed);
  const voxels: { position: [number, number, number]; color: THREE.Color }[] = [];
  const maxDist = isMobile ? 20 : 26;

  for (let x = -maxDist; x <= maxDist; x++) {
    for (let y = -maxDist; y <= maxDist; y++) {
      for (let z = -maxDist; z <= maxDist; z++) {
        const d = Math.sqrt(x * x + y * y + z * z);
        if (d > maxDist) continue;

        let colorObj = new THREE.Color('#ffffff');
        let isSolid = false;

        if (type === 'Earth') {
          const R = isMobile ? 10 : 13;
          
          if (earthData) {
            if (d > R + 2) continue;
            
            const nx = x / d;
            const ny = y / d;
            const nz = z / d;
            
            const lat = Math.asin(ny);
            const lon = Math.atan2(nx, nz);
            let u = 0.5 + lon / (2 * Math.PI);
            let v = 0.5 - lat / Math.PI;
            u = (u + 0.25) % 1.0; // Rotate to show a good starting angle
            
            const px = Math.floor(u * (earthData.width - 1));
            const py = Math.floor(v * (earthData.height - 1));
            const idx = (py * earthData.width + px) * 4;
            const r = earthData.data[idx] / 255;
            const g = earthData.data[idx+1] / 255;
            const b = earthData.data[idx+2] / 255;
            
            // Heuristic for ocean: blue is dominant
            const isOcean = b > r * 1.2 && b > g * 1.1 && r < 0.8;
            const elevation = isOcean ? R : R + 1; // Land is slightly elevated

            if (d <= elevation) {
              isSolid = true;
              if (d > elevation - 1) {
                colorObj.setRGB(r * 1.1, g * 1.1, b * 1.1); // Enhance colors slightly
              } else {
                if (d < R * 0.4) colorObj.set('#FF4500'); // Core
                else if (d < R * 0.7) colorObj.set('#8B0000'); // Mantle
                else colorObj.set('#8B4513'); // Crust
              }
            }
          } else {
            // Do not generate voxels until earthData is loaded
            continue;
          }
        } else if (type === 'Neptune') {
          const R = isMobile ? 10 : 13;
          
          if (d <= R) {
            isSolid = true;
            if (d > R - 1) { // Surface
              let band = Math.sin(y * 0.8 + noise3D(x*0.1, y*0.1, z*0.1));
              let cloud = noise3D(x*0.2, y*0.2, z*0.2);
              if (cloud > 0.6) colorObj.set('#FFFFFF'); // High altitude clouds
              else if (band > 0.5) colorObj.set('#3E66A8'); // Lighter bands
              else colorObj.set('#274687'); // Deep blue
            } else { // Interior
              colorObj.set('#1A2B56'); // Darker ice/water interior
            }
          }
        } else if (type === 'Mars') {
          const R = isMobile ? 7 : 9;
          if (d <= R) {
            isSolid = true;
            if (d > R - 1) { // Surface
              let n = noise3D(x * 0.15, y * 0.15, z * 0.15);
              let craterNoise = noise3D(x * 0.4, y * 0.4, z * 0.4);
              if (Math.abs(y) > R * 0.85) colorObj.set('#F5F5DC'); // Polar ice
              else if (craterNoise > 0.6) colorObj.set('#8B4513'); // Darker craters
              else if (n > 0.3) colorObj.set('#CD5C5C'); // Lighter red
              else colorObj.set('#B22222'); // Base red/orange
            } else {
              colorObj.set('#800000'); // Interior
            }
          }
        } else if (type === 'Jupiter') {
          const R = isMobile ? 13 : 17;
          if (d <= R) {
            isSolid = true;
            if (d > R - 1) { // Surface
              let band = Math.sin(y * 0.6 + noise3D(x*0.05, y*0.05, z*0.05));
              // Great Red Spot
              let spotDist = Math.sqrt(Math.pow(x - R*0.6, 2) + Math.pow(y + R*0.3, 2) + Math.pow(z - R*0.6, 2));
              if (spotDist < R * 0.25) {
                colorObj.set('#CE3A12'); // Red spot
              } else if (band > 0.7) colorObj.set('#D8CA9D');
              else if (band > 0.3) colorObj.set('#A5613A');
              else if (band > -0.2) colorObj.set('#C88B3A');
              else if (band > -0.6) colorObj.set('#E3CBA8');
              else colorObj.set('#904A26');
            } else {
              colorObj.set('#5C3A21'); // Interior
            }
          }
        } else if (type === 'Saturn') {
          const R = isMobile ? 6 : 8;
          
          if (d <= R) {
            isSolid = true;
            if (d > R - 1) { // Surface
              let band = Math.sin(y * 1.2 + noise3D(x*0.05, y*0.05, z*0.05)*0.5);
              if (band > 0.6) colorObj.set('#EAD6B8');
              else if (band > 0.2) colorObj.set('#D5B996');
              else if (band > -0.2) colorObj.set('#CEB8B8');
              else if (band > -0.6) colorObj.set('#C3A171');
              else colorObj.set('#E0C8B0');
            } else { // Interior
              colorObj.set('#A68B6A'); // Interior gas/liquid metallic hydrogen
            }
          }
          
          const innerR = R + 2;
          const outerR = R + (isMobile ? 6 : 8);
          const d_xz = Math.sqrt(x*x + z*z);
          
          if (Math.abs(y) <= 0.5 && d_xz >= innerR && d_xz <= outerR) {
            let ringNoise = Math.sin(d_xz * 2.0);
            if (ringNoise > -0.5) { // Create some gaps
              isSolid = true;
              if (ringNoise > 0.8) colorObj.set('#A89C82');
              else if (ringNoise > 0.2) colorObj.set('#D8CA9D');
              else colorObj.set('#E8D8B0');
            }
          }
        }

        if (isSolid) {
          voxels.push({ position: [x, y, z], color: colorObj });
        }
      }
    }
  }

  const result = voxels.sort(() => Math.random() - 0.5).slice(0, 25000);
  planetCache[cacheKey] = result;
  return result;
};

// --- 3D Components ---
function VoxelPlanet({ type, isMobile }: { type: string; isMobile: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const MAX_INSTANCES = 25000;
  const [earthData, setEarthData] = useState<ImageData | null>(globalEarthData);

  useEffect(() => {
    if (type === 'Earth' && !earthData) {
      if (globalEarthData) {
        setEarthData(globalEarthData);
      } else {
        earthDataCallbacks.push(setEarthData);
        return () => {
          earthDataCallbacks = earthDataCallbacks.filter(cb => cb !== setEarthData);
        };
      }
    }
  }, [type, earthData]);
  
  const instances = useRef<{
    position: THREE.Vector3;
    morphPosition: THREE.Vector3;
    targetPosition: THREE.Vector3;
    color: THREE.Color;
    targetColor: THREE.Color;
    scale: number;
    targetScale: number;
  }[]>([]);

  useEffect(() => {
    const newVoxels = generatePlanet(type, Math.random(), isMobile, earthData);
    
    if (instances.current.length === 0) {
      instances.current = Array.from({ length: MAX_INSTANCES }, (_, i) => {
        const v = newVoxels[i] || { position: [0,0,0], color: new THREE.Color(0,0,0) };
        return {
          position: new THREE.Vector3(...v.position),
          morphPosition: new THREE.Vector3(...v.position),
          targetPosition: new THREE.Vector3(...v.position),
          color: new THREE.Color(v.color),
          targetColor: new THREE.Color(v.color),
          scale: i < newVoxels.length ? 1 : 0,
          targetScale: i < newVoxels.length ? 1 : 0,
        };
      });
    } else {
      instances.current.forEach((inst, i) => {
        if (i < newVoxels.length) {
          inst.targetPosition.set(...newVoxels[i].position);
          inst.targetColor.copy(newVoxels[i].color);
          inst.targetScale = 1;
        } else {
          inst.targetScale = 0;
          inst.targetPosition.set(0,0,0);
        }
      });
    }
  }, [type, isMobile]);

  const raycaster = useThree((state) => state.raycaster);
  
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    raycaster.setFromCamera(state.pointer, state.camera);
    const localRay = raycaster.ray.clone();
    const inverseMatrix = new THREE.Matrix4().copy(meshRef.current.matrixWorld).invert();
    localRay.applyMatrix4(inverseMatrix);

    const dummy = new THREE.Object3D();
    const tempTargetPos = new THREE.Vector3();
    const tempDir = new THREE.Vector3();
    const swirlDir = new THREE.Vector3();
    const closestPoint = new THREE.Vector3();

    instances.current.forEach((inst, i) => {
      inst.morphPosition.lerp(inst.targetPosition, delta * 2.5);
      inst.color.lerp(inst.targetColor, delta * 2.5);
      
      let targetScale = inst.targetScale;
      tempTargetPos.copy(inst.morphPosition);
      
      if (inst.scale > 0) {
        localRay.closestPointToPoint(inst.morphPosition, closestPoint);
        const dist = closestPoint.distanceTo(inst.morphPosition);
        const repelRadius = isMobile ? 5 : 8;
        
        if (dist < repelRadius) {
          tempDir.subVectors(inst.morphPosition, closestPoint).normalize();
          swirlDir.crossVectors(tempDir, localRay.direction).normalize();
          
          const force = Math.pow((repelRadius - dist) / repelRadius, 2) * 1.5;
          tempTargetPos.add(tempDir.multiplyScalar(force));
          tempTargetPos.add(swirlDir.multiplyScalar(force * 0.15));
          tempTargetPos.add(localRay.direction.clone().multiplyScalar(force * 0.05));
          
          targetScale = inst.targetScale * (0.8 + 0.2 * (dist / repelRadius));
        }
      }

      inst.scale = THREE.MathUtils.lerp(inst.scale, targetScale, delta * 12);
      inst.position.lerp(tempTargetPos, delta * 15);

      dummy.position.copy(inst.position);
      dummy.scale.setScalar(inst.scale);
      dummy.updateMatrix();
      
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(i, inst.color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    
    meshRef.current.rotation.y += delta * 0.1;
    meshRef.current.rotation.x += delta * 0.05;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_INSTANCES]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} metalness={0.1} />
    </instancedMesh>
  );
}

function CameraRig() {
  const { size, viewport } = useThree();
  const isMobile = size.width < 768;
  
  useFrame((state) => {
    if (isMobile) {
      state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, 0, 0.05);
      state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, 0, 0.05);
    } else {
      const x = (state.pointer.x * state.viewport.width) / 50;
      const y = (state.pointer.y * state.viewport.height) / 50;
      state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, x, 0.05);
      state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, y, 0.05);
    }
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

import { PresentationControls } from '@react-three/drei';

function PlanetContainer({ activeTab }: { activeTab: string }) {
  const { size, viewport } = useThree();
  const isMobile = size.width < 768;
  
  useEffect(() => {
    const planets = ['Earth', 'Saturn', 'Neptune'];
    let i = 0;
    const pregenerate = () => {
      if (i < planets.length) {
        generatePlanet(planets[i], 123, isMobile, globalEarthData);
        i++;
        setTimeout(pregenerate, 150);
      }
    };
    setTimeout(pregenerate, 1000);
  }, [isMobile]);

  // Dynamically position planet in the center of the right half on desktop
  const targetPos = useMemo(() => new THREE.Vector3(isMobile ? 0 : viewport.width * 0.18, 0, 0), [isMobile, viewport.width]);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.position.lerp(targetPos, delta * 5);
      // Scale up slightly on mobile to fit the viewport better, and significantly on desktop
      const targetScale = isMobile ? 1.3 : 1.1;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 5);
    }
  });

  return (
    <group ref={groupRef}>
      <PresentationControls
        global={true}
        cursor={true}
        rotation={[0, 0, 0]}
        polar={[-Math.PI / 2, Math.PI / 2]}
        azimuth={[-Infinity, Infinity]}
      >
        <mesh>
          {/* Larger invisible sphere ensures easy grabbing and prevents rotation/repulsion bugs */}
          <sphereGeometry args={[isMobile ? 18 : 24, 32, 32]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <VoxelPlanet type={activeTab} isMobile={isMobile} />
      </PresentationControls>
    </group>
  );
}

// --- Main Page ---
export default function Page() {
  const [activeTab, setActiveTab] = useState('Earth');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#8A95A5] to-[#2A3441] text-white font-sans overflow-x-hidden flex flex-col md:block relative selection:bg-[#E8D0A5] selection:text-black select-none">
      
      {/* Navbar */}
      <nav className="relative z-20 flex items-center justify-between px-8 md:px-16 py-8 pointer-events-none">
        <div className="text-2xl font-serif font-bold tracking-tight pointer-events-auto">Cosmos.</div>
        <div className="hidden md:flex items-center gap-10 text-sm text-gray-300 font-medium pointer-events-auto">
          <a href="#" className="hover:text-white transition-colors">Collection</a>
          <a href="#" className="hover:text-white transition-colors">Process</a>
          <a href="#" className="hover:text-white transition-colors">Gallery</a>
          <a href="#" className="hover:text-white transition-colors">About</a>
        </div>
        <button className="bg-[#E8D0A5] text-black px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-[#d5bc90] transition-colors pointer-events-auto">
          Get Started
        </button>
      </nav>

      {/* 3D Background */}
      <div className="relative w-full h-[50vh] shrink-0 md:h-auto md:absolute md:inset-0 z-0 pointer-events-auto">
        <Canvas shadows camera={{ position: [0, 0, 60], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <directionalLight 
            position={[10, 20, 10]} 
            intensity={1.5} 
            castShadow 
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-10, -10, -10]} intensity={0.3} color="#8A95A5" />
          
          <PlanetContainer activeTab={activeTab} />
          
          <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
          <CameraRig />
          
          <EffectComposer>
            <Bloom luminanceThreshold={1} mipmapBlur intensity={1.2} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="relative z-10 flex flex-col flex-1 md:absolute md:inset-0 pointer-events-none">
        <div className="hidden md:block h-[104px]"></div>

        {/* Hero Content */}
        <main className="flex-1 flex flex-col justify-center px-8 md:px-16 py-8 md:py-0 pointer-events-none w-full md:w-[60%] lg:w-1/2 md:max-w-3xl z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-8 h-[1px] bg-[#E8D0A5]"></div>
            <span className="text-xs tracking-[0.2em] text-[#E8D0A5] uppercase font-bold">Generative Cosmos</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-serif leading-[1.1] mb-8 md:whitespace-nowrap">
            Crafting <span className="italic text-[#E8D0A5] font-light">Living</span><br />
            Digital Worlds
          </h1>
          
          <p className="text-[#A0AAB5] max-w-md text-lg leading-relaxed mb-10">
            Explore procedurally generated planets rendered in real-time 3D. Each world is a unique blend of mathematical systems and artistic design.
          </p>
          
          <div className="flex flex-wrap items-center gap-4 mb-16 pointer-events-auto">
            <button className="bg-[#E8D0A5] text-black px-8 py-3.5 rounded-lg font-semibold hover:bg-[#d5bc90] transition-colors">
              Explore Worlds
            </button>
            <button className="border border-gray-500 text-gray-300 px-8 py-3.5 rounded-lg font-semibold hover:border-gray-300 hover:text-white transition-colors">
              Watch Reel
            </button>
          </div>
          
          {/* Stats */}
          <div className="flex items-center gap-12 md:gap-16 border-t border-gray-600/40 pt-8 w-fit">
            <div>
              <div className="text-4xl font-serif mb-1">16</div>
              <div className="text-xs text-[#A0AAB5] uppercase tracking-wider font-semibold">Planet Types</div>
            </div>
            <div>
              <div className="text-4xl font-serif mb-1">∞</div>
              <div className="text-xs text-[#A0AAB5] uppercase tracking-wider font-semibold">Variations</div>
            </div>
            <div>
              <div className="text-4xl font-serif mb-1">60fps</div>
              <div className="text-xs text-[#A0AAB5] uppercase tracking-wider font-semibold">Real-time</div>
            </div>
          </div>
        </main>

        {/* Tabs */}
        <div className="mt-auto pb-8 md:pb-0 md:absolute md:bottom-12 md:left-1/2 md:-translate-x-1/2 flex justify-center w-full pointer-events-none">
          <div className="flex items-center gap-2 md:gap-4 bg-black/10 p-1.5 rounded-2xl backdrop-blur-sm border border-white/5 pointer-events-auto overflow-x-auto max-w-[90vw] scrollbar-hide">
            {['Earth', 'Saturn', 'Neptune'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 md:px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                  activeTab === tab 
                    ? 'bg-white/15 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
