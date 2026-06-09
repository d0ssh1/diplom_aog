// Stacked 3D building viewer (subfeature B). Renders one GLB per renderable floor
// at its ScenePlacement (scale / rotation.y / position, metres, building world
// frame) inside a single R3F <Canvas>, with per-floor error isolation. Room number
// labels are shown for the TOP visible floor only (lower floors stay clean).
// Reuses the shared trimesh fix (lib/glbScene) + dispose util. No `any`.

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { prepareTrimeshScene } from '../lib/glbScene';
import { disposeObject3D } from '../lib/disposeObject3D';
import { MultifloorRoutePath } from './MeshViewer/MultifloorRoutePath';
import type { SceneFloor } from '../types/buildingScene';
import type { FloorPathSegment3D, TransitionUsed3D } from '../types/buildingNav';
import type { Room3DApi } from '../api/apiService';

const BACKGROUND = '#FFFFFF';

const LABEL_STYLE: React.CSSProperties = {
  color: 'white',
  fontWeight: 600,
  fontSize: '12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textShadow: '0px 1px 3px rgba(0,0,0,0.85)',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  background: 'rgba(17,24,39,0.55)',
  padding: '1px 5px',
  borderRadius: '4px',
};

// Stairs/elevators get a compact icon pill instead of the long "Лестница"/"Лифт"
// caption — same dark chip, but icon-only so it doesn't crowd the model.
const ICON_PILL_STYLE: React.CSSProperties = {
  ...LABEL_STYLE,
  padding: '3px',
  display: 'inline-flex',
  lineHeight: 0,
};

/** Stairs glyph (descending steps), white stroke for the dark chip. */
function StairsGlyph(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 5h-4v4h-4v4H8v4H4" />
    </svg>
  );
}

/** Elevator glyph (cabin with up/down arrows). */
function ElevatorGlyph(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M9.5 9.5 12 7l2.5 2.5M9.5 14.5 12 17l2.5-2.5" />
    </svg>
  );
}

/** Floating labels for one floor: stairs/lifts → icon, other rooms → name. */
function FloorLabels({ rooms }: { rooms: Room3DApi[] }): React.ReactElement {
  return (
    <>
      {rooms
        .filter(
          (r) =>
            r.room_type === 'staircase' ||
            r.room_type === 'elevator' ||
            (r.name && r.name.trim() !== ''),
        )
        .map((r) => {
          const isStair = r.room_type === 'staircase';
          const isLift = r.room_type === 'elevator';
          return (
            <Html
              key={r.id}
              center
              position={r.position}
              style={{ pointerEvents: 'none' }}
              zIndexRange={[10, 0]}
            >
              {isStair || isLift ? (
                <div
                  style={ICON_PILL_STYLE}
                  title={r.name || (isStair ? 'Лестница' : 'Лифт')}
                >
                  {isStair ? <StairsGlyph /> : <ElevatorGlyph />}
                </div>
              ) : (
                <div style={LABEL_STYLE}>{r.name}</div>
              )}
            </Html>
          );
        })}
    </>
  );
}

/** One floor's GLB, placed in the building world frame via its ScenePlacement. */
function FloorGlb({
  floor,
  labels,
}: {
  floor: SceneFloor;
  labels?: Room3DApi[];
}): React.ReactElement | null {
  // Renderable floors always have a url + placement (the parent filters), but the
  // hook must be called unconditionally → assert here.
  const { scene } = useGLTF(floor.mesh_url as string);
  // Keep baked vertex colours so the dark floor slab stays distinct from grey walls.
  const prepared = useMemo(
    () => prepareTrimeshScene(scene, { keepVertexColors: true }),
    [scene],
  );

  useEffect(() => {
    const root = prepared;
    return () => disposeObject3D(root, { disposeGeometry: true });
  }, [prepared]);

  const p = floor.placement;
  if (p === null) return null;
  // Labels live INSIDE the placement group, so they ride the floor's
  // scale/rotation/position automatically (positions are in floor-local metres).
  return (
    <group
      position={[p.tx, p.ty, p.tz]}
      rotation={[0, p.rotation_y_rad, 0]}
      scale={p.scale}
    >
      <primitive object={prepared} />
      {labels && labels.length > 0 ? <FloorLabels rooms={labels} /> : null}
    </group>
  );
}

/** Isolate one floor's load/render failure so a single bad GLB cannot blank the scene. */
class FloorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Isometric auto-fit over the union of all loaded floors. GLBs load
 * progressively, so a one-shot fit can lock onto a half-loaded scene and leave
 * the building tiny. Instead we re-frame the FULL current bounding box every
 * frame UNTIL the user first orbits/zooms — then we stop, so their view (and any
 * floor they hide/show afterwards) is preserved.
 */
function CameraRig({
  groupRef,
}: {
  groupRef: React.RefObject<THREE.Group>;
}): null {
  const { camera, controls } = useThree();
  const userMovedRef = useRef(false);

  // Freeze auto-framing the moment the operator interacts with the controls.
  useEffect(() => {
    const ctrl = controls as unknown as {
      addEventListener?: (t: string, f: () => void) => void;
      removeEventListener?: (t: string, f: () => void) => void;
    } | null;
    if (!ctrl?.addEventListener) return;
    const onStart = (): void => {
      userMovedRef.current = true;
    };
    ctrl.addEventListener('start', onStart);
    return () => ctrl.removeEventListener?.('start', onStart);
  }, [controls]);

  useFrame(() => {
    if (userMovedRef.current || groupRef.current === null) return;
    const box = new THREE.Box3().setFromObject(groupRef.current);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    if (size.length() <= 0) return;
    const center = box.getCenter(new THREE.Vector3());
    // Fit the building's footprint to the actual viewport (both fov axes), not
    // its bounding sphere — a long thin building over-pads the sphere and ends up
    // tiny. Frame the ground-footprint diagonal horizontally and (height + a
    // slice of the footprint, for the tilt) vertically; take the larger distance.
    const persp = camera as THREE.PerspectiveCamera;
    const vFov = (persp.fov * Math.PI) / 180;
    const aspect = persp.aspect > 0 ? persp.aspect : 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const groundDiag = Math.hypot(size.x, size.z);
    const distForWidth = groundDiag / 2 / Math.tan(hFov / 2);
    const distForHeight = (size.y + groundDiag * 0.5) / 2 / Math.tan(vFov / 2);
    const dist = Math.max(distForWidth, distForHeight, 2) * 1.25;
    // Lower, more side-on isometric angle (~33° elevation) so the building reads
    // as a 3D volume and fills the frame, like the end-user floor viewer.
    camera.position.set(
      center.x + dist * 0.62,
      center.y + dist * 0.55,
      center.z + dist * 0.56,
    );
    camera.lookAt(center);
    persp.far = Math.max(5000, dist * 4);
    camera.updateProjectionMatrix();
    const ctrl = controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    } | null;
    if (ctrl) {
      ctrl.target.copy(center);
      ctrl.update();
    }
  });

  return null;
}

export interface BuildingMeshViewerProps {
  /** Floors to draw — already filtered to renderable ∧ visible by the caller. */
  floors: SceneFloor[];
  /** Per-floor room boxes; labels render for the TOP visible floor only. */
  roomsByFloor?: Record<number, Room3DApi[]>;
  /** Optional cross-floor route (subfeature D) drawn in the shared world frame.
   *  Independent of floor visibility — it stays drawn even when floors are hidden. */
  routeSegments?: FloorPathSegment3D[];
  /** Optional stair/elevator risers for the route. */
  routeTransitions?: TransitionUsed3D[];
}

export const BuildingMeshViewer: React.FC<BuildingMeshViewerProps> = ({
  floors,
  roomsByFloor,
  routeSegments,
  routeTransitions,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  // Top visible floor = the highest floor number among the drawn floors.
  const topFloorId =
    floors.length > 0
      ? floors.reduce((acc, f) => (f.number > acc.number ? f : acc), floors[0])
          .floor_id
      : null;

  return (
    <Canvas
      camera={{ position: [0, 50, 40], fov: 45, near: 0.1, far: 5000 }}
      style={{ background: BACKGROUND }}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.9} color="#ffffff" />
      <directionalLight position={[30, 60, 30]} intensity={0.7} />
      <directionalLight position={[-20, 30, -20]} intensity={0.2} />
      <hemisphereLight args={['#e8e4dc', '#b0aaa0', 0.4]} />

      <group ref={groupRef}>
        {floors.map((floor) => (
          <FloorErrorBoundary key={floor.floor_id}>
            <Suspense fallback={null}>
              <FloorGlb
                floor={floor}
                labels={
                  floor.floor_id === topFloorId
                    ? roomsByFloor?.[floor.floor_id]
                    : undefined
                }
              />
            </Suspense>
          </FloorErrorBoundary>
        ))}

        {/* Cross-floor route (D): a standalone scene object in the SAME building
            world frame as the floor GLBs, so it stays correct (and visible) for
            any subset of shown floors. */}
        {routeSegments && routeSegments.length > 0 && (
          <MultifloorRoutePath
            segments={routeSegments}
            transitions={routeTransitions ?? []}
          />
        )}
      </group>

      <CameraRig groupRef={groupRef} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={1}
        maxDistance={2000}
      />
    </Canvas>
  );
};

export default BuildingMeshViewer;
