# Three.js Patterns: Diplom3D 3D Rendering

## Architecture

All Three.js logic lives in custom hooks, NOT in components.
Components only render the `<div ref={containerRef} />` and call hooks.

```
components/
├── ThreeViewer/
│   └── ThreeViewer.tsx          ← renders container div, calls hook
hooks/
├── useThreeScene.ts             ← scene setup, camera, renderer, cleanup
├── useFloorPlanMesh.ts          ← builds wall/floor geometry from data
├── useOrbitControls.ts          ← camera controls
└── usePathOverlay.ts            ← A* path visualization
```

---

## Scene Hook Pattern

```typescript
// hooks/useThreeScene.ts
import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

interface UseThreeSceneReturn {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
}

export const useThreeScene = (
  containerRef: React.RefObject<HTMLDivElement>
): UseThreeSceneReturn => {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameIdRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Init
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap at 2x
    container.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // Animation loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // CLEANUP — MANDATORY
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameIdRef.current);

      // Dispose all scene children
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []); // mount/unmount only

  return { sceneRef, cameraRef, rendererRef };
};
```

---

## Geometry from Floor Plan Data

```typescript
// hooks/useFloorPlanMesh.ts

interface WallData {
  points: Array<{ x: number; y: number }>;  // normalized [0, 1]
  thickness: number;
}

/**
 * Convert 2D wall polylines to 3D extruded geometry.
 * Coordinates: X = plan X, Z = plan Y, Y = height (up).
 * All input coordinates are normalized [0, 1], scale to world units here.
 */
export const useFloorPlanMesh = (
  sceneRef: React.MutableRefObject<THREE.Scene | null>,
  walls: WallData[],
  options: {
    wallHeight?: number;  // default 3.0 (meters)
    wallColor?: number;   // default 0xcccccc
    floorSize?: number;   // world units for [0,1] → [0, floorSize]
  }
) => {
  const meshGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || walls.length === 0) return;

    const { wallHeight = 3.0, wallColor = 0xcccccc, floorSize = 20 } = options;

    // Clean previous
    if (meshGroupRef.current) {
      scene.remove(meshGroupRef.current);
      // dispose old geometries...
    }

    const group = new THREE.Group();

    walls.forEach((wall) => {
      // Build wall mesh from polyline
      // Scale from [0,1] to world units
      const scaledPoints = wall.points.map((p) => ({
        x: p.x * floorSize,
        z: p.y * floorSize,  // Y in 2D → Z in 3D
      }));
      // ... extrusion logic
    });

    scene.add(group);
    meshGroupRef.current = group;

    return () => {
      if (meshGroupRef.current && scene) {
        scene.remove(meshGroupRef.current);
        // dispose geometries
      }
    };
  }, [walls]); // re-run when wall data changes
};
```

---

## Critical Rules

### Memory Management
- **ALWAYS dispose** geometries, materials, textures on unmount
- **ALWAYS cancel** `requestAnimationFrame` on unmount
- **ALWAYS remove** `renderer.domElement` from DOM on unmount
- Cap `pixelRatio` at 2 — `Math.min(window.devicePixelRatio, 2)`

### Coordinate System
- Backend sends normalized [0, 1] coordinates
- Frontend scales to world units: `point * floorSize`
- Three.js convention: X right, Y up, Z toward viewer
- Floor plan mapping: plan X → Three.js X, plan Y → Three.js Z, height → Three.js Y

### Performance
- Use `BufferGeometry` (not legacy `Geometry`)
- Merge walls into single geometry where possible (reduces draw calls)
- Use `instancedMesh` for repeated elements (doors, windows)
- Don't create new materials per wall — share one material instance

### What NOT to do
- ❌ Creating Three.js objects inside render cycle
- ❌ `useEffect` without cleanup for Three.js resources
- ❌ Storing Three.js objects in React state (causes re-renders)
- ❌ `console.log` in animation loop
- ❌ Loading models on every re-render (cache in ref)
