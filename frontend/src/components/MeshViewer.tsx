import { Suspense } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';
import { OBJLoader } from 'three-stdlib';

interface ModelProps {
  url: string;
  format: 'obj' | 'glb';
}

function Model({ url, format }: ModelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scene: any;

  if (format === 'glb') {
    const gltf = useGLTF(url);
    scene = gltf.scene;
  } else {
    // OBJ Loader logic
    // eslint-disable-next-line react-hooks/rules-of-hooks
    scene = useLoader(OBJLoader, url);
  }

  return <primitive object={scene} />;
}

interface MeshViewerProps {
  url: string;
  format?: 'obj' | 'glb';
}

export default function MeshViewer({ url, format = 'obj' }: MeshViewerProps) {
  // Определяем формат по расширению, если не задан явно
  const detectFormat = (): 'obj' | 'glb' => {
    if (format) return format;
    if (url.toLowerCase().endsWith('.glb')) return 'glb';
    return 'obj'; // default
  };

  const modelFormat = detectFormat();

  return (
    <Canvas shadows camera={{ position: [0, 0, 15], fov: 50 }}>
      {/* Освещение и тени */}
      <Suspense fallback={null}>
        <Stage environment="city" intensity={0.6}>
          <Model url={url} format={modelFormat} />
        </Stage>
      </Suspense>
      
      {/* Управление камерой */}
      <OrbitControls makeDefault />
    </Canvas>
  );
}
