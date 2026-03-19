import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { OBJLoader } from 'three-stdlib';
import * as THREE from 'three';

/* ────────────────────────────────────────────
   2GIS / Яндекс Карты palette
   ──────────────────────────────────────────── */
const COLORS = {
  wallFallback: '#9E9E9E',  // fallback для OBJ (без vertex colors)
  background:   '#ECEFF1',  // светлый фон
};

/* ────────────────────────────────────────────
   Camera: auto-fit to model, top-down isometric
   ──────────────────────────────────────────── */
function CameraSetup({ modelRef }: { modelRef: React.RefObject<THREE.Object3D> }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    if (!modelRef.current) return;

    const box = new THREE.Box3().setFromObject(modelRef.current);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.z);
    const dist = maxDim * 1.0;

    // Изометрия ~70° сверху — как 2GIS при открытии здания
    camera.position.set(
      center.x + dist * 0.15,
      center.y + dist * 0.85,
      center.z + dist * 0.35,
    );
    camera.lookAt(center);
    (camera as THREE.PerspectiveCamera).far = Math.max(5000, dist * 4);
    camera.updateProjectionMatrix();

    if (controls) {
      const ctrl = controls as unknown as { target: THREE.Vector3; update: () => void };
      ctrl.target.copy(center);
      ctrl.update();
    }
  }, [camera, controls, modelRef]);

  return null;
}

/* ────────────────────────────────────────────
   Floor plane — бежевый пол под моделью
   ──────────────────────────────────────────── */
function FloorPlane({ modelRef }: { modelRef: React.RefObject<THREE.Object3D> }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!modelRef.current || !meshRef.current) return;

    const box = new THREE.Box3().setFromObject(modelRef.current);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Пол чуть больше модели
    const pad = 1.5;
    meshRef.current.scale.set(size.x * pad, size.z * pad, 1);
    meshRef.current.position.set(center.x, box.min.y - 0.05, center.z);
  }, [modelRef]);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1, 1]} />
      <meshLambertMaterial color="#F5F0E8" />
    </mesh>
  );
}

/* ────────────────────────────────────────────
   Apply 2GIS-style materials to loaded model
   ──────────────────────────────────────────── */
function applyMapMaterials(root: THREE.Object3D, useVertexColors: boolean) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // Check if geometry actually has vertex colors
      const hasColors = useVertexColors && child.geometry.hasAttribute('color');
      const material = new THREE.MeshStandardMaterial({
        vertexColors: hasColors,
        color: hasColors ? 0xffffff : COLORS.wallFallback,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

/* ────────────────────────────────────────────
   OBJ model loader
   ──────────────────────────────────────────── */
function ObjModel({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);
  const ref = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (ref.current) applyMapMaterials(ref.current, false);
  }, [obj]);

  return (
    <>
      <primitive ref={ref} object={obj} />
      <CameraSetup modelRef={ref} />
      <FloorPlane modelRef={ref} />
    </>
  );
}

/* ────────────────────────────────────────────
   GLB model loader
   ──────────────────────────────────────────── */
function GlbModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const ref = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (ref.current) applyMapMaterials(ref.current, true);
  }, [scene]);

  return (
    <>
      <primitive ref={ref} object={scene} />
      <CameraSetup modelRef={ref} />
      <FloorPlane modelRef={ref} />
    </>
  );
}

/* ────────────────────────────────────────────
   Main MeshViewer component
   ──────────────────────────────────────────── */
interface MeshViewerProps {
  url: string;
  format?: 'obj' | 'glb';
  children?: React.ReactNode;
}

export default function MeshViewer({ url, format, children }: MeshViewerProps) {
  const modelFormat: 'obj' | 'glb' =
    format ?? (url.toLowerCase().endsWith('.glb') ? 'glb' : 'obj');

  return (
    <Canvas
      camera={{ position: [0, 50, 20], fov: 45, near: 0.1, far: 5000 }}
      shadows
      style={{ background: COLORS.background }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
    >
      {/* Мягкий ambient — снижен для контраста с тёмными стенами */}
      <ambientLight intensity={0.5} color="#f0ede8" />

      {/* Основной направленный — сверху-слева, с тенями */}
      <directionalLight
        position={[30, 60, 30]}
        intensity={0.9}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={200}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-bias={-0.001}
      />

      {/* Заполняющий с другой стороны */}
      <directionalLight position={[-20, 30, -20]} intensity={0.2} />

      {/* Hemisphere — тёплый сверху, нейтральный снизу */}
      <hemisphereLight args={['#e8e4dc', '#b0aaa0', 0.4]} />

      <Suspense fallback={null}>
        {modelFormat === 'glb'
          ? <GlbModel url={url} />
          : <ObjModel url={url} />
        }
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={1}
        maxDistance={500}
      />

      {children}
    </Canvas>
  );
}