"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useMemo, useState, useEffect, useCallback, type RefObject } from "react";
import * as THREE from "three";
import { COUNTRY_RINGS } from "./country-outlines";

const TEAL = new THREE.Color("#00B0BB");
const GREEN = new THREE.Color("#00DB65");
const TEAL_HEX = 0x00b0bb;
const GREEN_HEX = 0x00db65;

/* Country/city to lat,lng lookup */
const COUNTRY_COORDS: Record<string, [number, number]> = {
  "Mexico": [19.43, -99.13], "Honduras": [14.09, -87.21], "Brazil": [-15.78, -47.93],
  "El Salvador": [13.69, -89.19], "Guatemala": [14.63, -90.51], "Argentina": [-34.6, -58.38],
  "Peru": [-12.05, -77.04], "Colombia": [4.71, -74.07], "Costa Rica": [9.93, -84.08],
  "Chile": [-33.45, -70.66], "Dominica": [15.3, -61.39], "Belize": [17.25, -88.77],
  "Uruguay": [-34.9, -56.16], "Dominican Republic": [18.47, -69.9], "Venezuela": [10.49, -66.88],
  "Philippines": [14.6, 121.0], "Bangladesh": [23.81, 90.41], "United States": [25.76, -80.19],
  "Other": [0, 0],
};
const CITY_COORDS: Record<string, [number, number]> = {
  "Culiacan": [24.8, -107.39], "Ipatinga": [-19.47, -42.54], "Brasilia": [-15.78, -47.93],
  "san salvador": [13.69, -89.19], "Soyapango": [13.72, -89.15], "Coronado": [9.98, -83.97],
  "Chaclacayo": [-11.98, -76.77], "Canelones": [-34.52, -56.28], "San Felipe": [19.3, -70.7],
  "Scafati": [40.75, 14.53],
};

type Location = { country: string; city: string };

function resolveLocations(locations: Location[]): [number, number][] {
  const seen = new Set<string>();
  const results: [number, number][] = [];
  for (const loc of locations) {
    const cityCoord = CITY_COORDS[loc.city];
    const countryCoord = COUNTRY_COORDS[loc.country];
    const coord = cityCoord || countryCoord;
    if (!coord || (coord[0] === 0 && coord[1] === 0)) continue;
    // Jitter duplicates slightly so they don't stack
    const key = `${coord[0].toFixed(1)},${coord[1].toFixed(1)}`;
    const jitter = seen.has(key) ? (Math.random() - 0.5) * 2 : 0;
    seen.add(key);
    results.push([coord[0] + jitter, coord[1] + jitter]);
  }
  // Add Miami HQ
  results.push([25.76, -80.19]);
  return results;
}

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function buildArc(p1: THREE.Vector3, p2: THREE.Vector3, segments = 48): THREE.Vector3[] {
  const mid = p1.clone().add(p2).multiplyScalar(0.5);
  const dist = p1.distanceTo(p2);
  mid.normalize().multiplyScalar(1.0 + dist * 0.35);
  const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
  return curve.getPoints(segments);
}

/* Country outlines — embedded data, no fetch needed */
function CountryOutlines() {
  const lineObjects = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: 0x00ccdd, transparent: true, opacity: 0.3, depthWrite: false });
    const objects: THREE.Line[] = [];

    for (const flat of COUNTRY_RINGS as number[][]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        const lng = flat[i];
        const lat = flat[i + 1];
        points.push(latLngToVec3(lat, lng, 1.006));
      }
      if (points.length >= 3) {
        points.push(points[0].clone());
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        objects.push(new THREE.Line(geo, mat));
      }
    }
    return objects;
  }, []);

  return (
    <group>
      {lineObjects.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
    </group>
  );
}

/* Wireframe globe */
function Globe({ mouse, hubs }: { mouse: RefObject<{ x: number; y: number }>; hubs: [number, number][] }) {
  const groupRef = useRef<THREE.Group>(null!);
  const baseRotation = useRef(0);

  const wireGeo = useMemo(() => new THREE.SphereGeometry(1, 36, 24), []);
  const wireMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: TEAL_HEX, wireframe: true, transparent: true, opacity: 0.08 }),
    []
  );
  const solidMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: TEAL_HEX, transparent: true, opacity: 0.02, side: THREE.FrontSide }),
    []
  );
  const atmosGeo = useMemo(() => new THREE.SphereGeometry(1.12, 32, 20), []);
  const atmosMat = useMemo(
    () => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: TEAL } },
      vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying vec3 vNormal; void main() { float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0); gl_FragColor = vec4(uColor, intensity * 0.35); }`,
      side: THREE.BackSide,
    }),
    []
  );

  useFrame((_, rawDelta) => {
    // Clamp delta to prevent spin-burst when returning to tab
    const delta = Math.min(rawDelta, 0.05);
    baseRotation.current += delta * 0.08;
    const m = mouse.current ?? { x: 0, y: 0 };
    const targetY = baseRotation.current + m.x * 0.3;
    const targetX = m.y * 0.15;
    const g = groupRef.current;
    g.rotation.y += (targetY - g.rotation.y) * 0.03;
    g.rotation.x += (targetX - g.rotation.x) * 0.03;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={wireGeo} material={wireMat} />
      <mesh geometry={wireGeo} material={solidMat} />
      <mesh geometry={atmosGeo} material={atmosMat} />
      <CountryOutlines />
      <HubDots hubs={hubs} />
      <ConnectionArcs hubs={hubs} />
    </group>
  );
}

/* Contractor dots */
function HubDots({ hubs }: { hubs: [number, number][] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const count = hubs.length;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const positions = useMemo(() => hubs.map(([lat, lng]) => latLngToVec3(lat, lng, 1.01)), [hubs]);

  useEffect(() => {
    if (!meshRef.current) return;
    positions.forEach((pos, i) => {
      dummy.position.copy(pos);
      dummy.scale.setScalar(0.02);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, dummy]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    positions.forEach((pos, i) => {
      const pulse = 1 + Math.sin(t * 2 + i * 0.7) * 0.3;
      dummy.position.copy(pos);
      dummy.scale.setScalar(0.02 * pulse);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={GREEN_HEX} transparent opacity={0.9} />
    </instancedMesh>
  );
}

/* Arcs connecting Miami HQ to each contractor hub */
function ConnectionArcs({ hubs }: { hubs: [number, number][] }) {
  if (hubs.length < 2) return null;
  // HQ is last element (Miami), connect to all others
  const hqIdx = hubs.length - 1;
  const pairs: [number, number][] = [];
  for (let i = 0; i < hqIdx && i < 12; i++) {
    pairs.push([hqIdx, i]);
  }

  return (
    <group>
      {pairs.map(([a, b], i) => (
        <SingleArc key={i} from={hubs[a]} to={hubs[b]} delay={i * 0.4} />
      ))}
    </group>
  );
}

function SingleArc({ from, to, delay }: { from: [number, number]; to: [number, number]; delay: number }) {
  const lineRef = useRef<THREE.Line>(null!);
  const geo = useMemo(() => {
    const p1 = latLngToVec3(from[0], from[1], 1.01);
    const p2 = latLngToVec3(to[0], to[1], 1.01);
    const pts = buildArc(p1, p2);
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [from, to]);

  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: TEAL_HEX, transparent: true, opacity: 0 }),
    []
  );

  const lineObj = useMemo(() => new THREE.Line(geo, mat), [geo, mat]);

  useFrame(({ clock }) => {
    const t = ((clock.getElapsedTime() - delay) % 6) / 6;
    if (t < 0) { mat.opacity = 0; return; }
    mat.opacity = t < 0.5 ? t * 0.3 : Math.max(0, (1 - t) * 0.3);
  });

  return <primitive ref={lineRef} object={lineObj} />;
}

/* Stars — subtle twinkling field */
function Stars() {
  const count = 1200;
  const { positions, sizes, opacities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const op = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 4 + Math.random() * 8;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = 0.2 + Math.random() * 0.8;
      op[i] = 0.15 + Math.random() * 0.45;
    }
    return { positions: pos, sizes: sz, opacities: op };
  }, []);

  const starShader = useMemo(() => ({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      attribute float opacity;
      varying float vOpacity;
      uniform float uTime;
      void main() {
        vOpacity = opacity * (0.5 + 0.5 * sin(uTime * 0.4 + position.x * 3.0 + position.y * 1.7));
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (80.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float alpha = (1.0 - d * d) * vOpacity;
        gl_FragColor = vec4(0.85, 0.9, 1.0, alpha);
      }
    `,
  }), []);
  const shaderRef = useRef<THREE.ShaderMaterial>(null!);
  useFrame(({ clock }) => { if (shaderRef.current) shaderRef.current.uniforms.uTime.value = clock.getElapsedTime(); });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-opacity" args={[opacities, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={shaderRef} uniforms={starShader.uniforms} vertexShader={starShader.vertexShader} fragmentShader={starShader.fragmentShader} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** Nebula — procedural gas clouds */
function Nebula() {
  const groupRef = useRef<THREE.Group>(null!);

  const nebulaTexture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.4)");
    gradient.addColorStop(0.2, "rgba(255,255,255,0.2)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.06)");
    gradient.addColorStop(0.8, "rgba(255,255,255,0.01)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 400; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const dist = Math.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2) / (size / 2);
      if (dist > 1) continue;
      const alpha = (1 - dist) * 0.15 * Math.random();
      const r2 = 2 + Math.random() * 8;
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, r2);
      g2.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g2.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(x - r2, y - r2, r2 * 2, r2 * 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const clouds = useMemo(() => [
    { pos: [2.5, 2.2, -5] as [number, number, number], scale: 6, color: "#004455", opacity: 0.12, rot: 0.4 },
    { pos: [3.2, 1.5, -6.5] as [number, number, number], scale: 4.5, color: "#005566", opacity: 0.08, rot: 1.8 },
    { pos: [1.8, 2.8, -7] as [number, number, number], scale: 5, color: "#003d4d", opacity: 0.06, rot: 2.5 },
    { pos: [4.5, -0.5, -7] as [number, number, number], scale: 5.5, color: "#1a1040", opacity: 0.08, rot: 1.2 },
    { pos: [3.8, 0.5, -8] as [number, number, number], scale: 4, color: "#2a1555", opacity: 0.06, rot: 0.7 },
    { pos: [-2, -2.5, -6] as [number, number, number], scale: 5.5, color: "#1a2a10", opacity: 0.07, rot: 3.1 },
    { pos: [-3.5, -1.5, -7.5] as [number, number, number], scale: 4.5, color: "#0a3322", opacity: 0.06, rot: 2.0 },
    { pos: [-4, 1, -6] as [number, number, number], scale: 5, color: "#002a15", opacity: 0.05, rot: 0.9 },
    { pos: [0, 0, -10] as [number, number, number], scale: 12, color: "#050a10", opacity: 0.15, rot: 0 },
    { pos: [2, -1, -9] as [number, number, number], scale: 8, color: "#08121a", opacity: 0.1, rot: 1.5 },
  ], []);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.008) * 0.015;
      groupRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.005) * 0.01;
    }
  });

  return (
    <group ref={groupRef}>
      {clouds.map((cloud, i) => (
        <sprite key={i} position={cloud.pos} scale={[cloud.scale, cloud.scale, 1]}>
          <spriteMaterial
            map={nebulaTexture}
            color={cloud.color}
            transparent
            opacity={cloud.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            rotation={cloud.rot}
          />
        </sprite>
      ))}
    </group>
  );
}

/* Camera rig */
function CameraRig({ mouse }: { mouse: RefObject<{ x: number; y: number }> }) {
  const { camera } = useThree();
  useFrame(() => {
    const m = mouse.current ?? { x: 0, y: 0 };
    camera.position.x += (m.x * 0.15 - camera.position.x) * 0.02;
    camera.position.y += (m.y * 0.1 - camera.position.y + 0.05) * 0.02;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/* Main component */
export function GlobeScene({
  contractorCount,
  countryCount,
  locations,
}: {
  contractorCount?: number;
  countryCount?: number;
  locations?: Location[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  const hubs = useMemo(() => {
    if (locations && locations.length > 0) return resolveLocations(locations);
    // Fallback to hardcoded if no locations provided
    return [[14.6, -90.5], [9.93, -84.08], [4.71, -74.07], [-23.55, -46.63], [-34.6, -58.38], [19.43, -99.13], [14.09, -87.21], [25.76, -80.19]] as [number, number][];
  }, [locations]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouse.current = {
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: -((e.clientY - rect.top) / rect.height - 0.5) * 2,
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("mousemove", handleMouseMove);
    return () => el.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: "clamp(320px, 42vh, 520px)", isolation: "isolate" }}
    >
      <div className="absolute inset-0 z-0" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,176,187,0.12) 0%, rgba(0,219,101,0.05) 40%, transparent 70%)" }} />
      <div className={`absolute inset-0 z-10 transition-opacity duration-1000 ${isLoaded ? "opacity-100" : "opacity-0"}`}>
        <Canvas
          camera={{ position: [0, 0, 3.2], fov: 35 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
          onCreated={() => setIsLoaded(true)}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.3} />
          <Nebula />
          <Globe mouse={mouse} hubs={hubs} />
          <Stars />
          <CameraRig mouse={mouse} />
        </Canvas>
      </div>

      <div className="absolute inset-0 z-20 flex flex-col justify-end pointer-events-none">
        <div className="px-8 sm:px-12 pb-1">
          <div className="flex items-baseline gap-2 sm:gap-3 mb-1 select-none">
            {["H", "R", "I", "Q"].map((letter) => (
              <span key={letter} className="text-6xl sm:text-7xl md:text-8xl font-black" style={{
                background: letter === "Q" ? "linear-gradient(135deg, #00B0BB 0%, #18E299 65%, #00DB65 100%)" : "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "0.08em",
              }}>{letter}</span>
            ))}
          </div>
          <div className="flex gap-6 pb-1">
            {contractorCount != null && (
              <div>
                <div className="text-2xl font-bold text-white/90">{contractorCount}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mt-0.5">Contractors</div>
              </div>
            )}
            {contractorCount != null && countryCount != null && <div className="w-px bg-white/10" />}
            {countryCount != null && (
              <div>
                <div className="text-2xl font-bold text-white/90">{countryCount}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mt-0.5">Countries</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
