// Reusable cross-floor 3D routes view (subfeature D). Composes B's stacked
// BuildingMeshViewer with the route polyline + the route-building panel + a
// per-floor visibility checklist. Self-contained behind a single `buildingId`
// prop so it can drop into the admin page AND the end-user start screen.
//
// The route is computed on the FULL building graph (backend) and rendered as a
// standalone scene object, so hiding floors here never changes or breaks it.

import React, { useCallback, useState } from 'react';
import { useBuildingScene } from '../../hooks/useBuildingScene';
import { BuildingMeshViewer } from '../BuildingMeshViewer';
import { MultifloorRoutePanel } from './MultifloorRoutePanel';
import type { MultifloorRouteResponse } from '../../types/buildingNav';
import styles from './Multifloor3DRoutes.module.css';

export interface Multifloor3DRoutesProps {
  buildingId: number;
  /** Optional: jump to the building-assembly editor (shown on not_aligned). */
  onGoToAssembly?: () => void;
}

export const Multifloor3DRoutes: React.FC<Multifloor3DRoutesProps> = ({
  buildingId,
  onGoToAssembly,
}) => {
  const {
    scene,
    isLoading,
    error,
    renderable,
    roomsByFloor,
    visible,
    toggle,
    showOnly,
  } = useBuildingScene(buildingId);
  const [result, setResult] = useState<MultifloorRouteResponse | null>(null);

  // On a fresh successful route, jump the view to the START floor (where the
  // «Откуда» room is) — the first segment's floor — so the user sees the start.
  const handleResult = useCallback(
    (res: MultifloorRouteResponse | null): void => {
      setResult(res);
      if (res && res.status === 'success' && res.path_segments.length > 0) {
        showOnly(res.path_segments[0].floor_id);
      }
    },
    [showOnly],
  );

  if (isLoading) {
    return <div className={styles.note}>Загрузка 3D-сцены…</div>;
  }
  if (error) {
    return <div className={styles.note}>{error}</div>;
  }
  if (!scene || scene.floors.length === 0) {
    return <div className={styles.note}>В здании нет этажей.</div>;
  }

  const floorOptions = scene.floors.map((f) => ({
    floor_id: f.floor_id,
    number: f.number,
  }));
  const isSuccess = result !== null && result.status === 'success';
  // Draw a floor's route line ONLY while that floor is shown — hiding a floor
  // hides its segment too (a transition needs BOTH its floors visible).
  const segments = isSuccess
    ? result.path_segments.filter((s) => visible.has(s.floor_id))
    : [];
  const transitions = isSuccess
    ? result.transitions_used.filter(
        (t) => visible.has(t.from_floor_id) && visible.has(t.to_floor_id),
      )
    : [];

  // Floors shown high → low so the pill order matches the visual stack.
  const orderedFloors = [...scene.floors].sort((a, b) => b.number - a.number);

  return (
    <div className={styles.wrap}>
      {/* Left: white controls panel (mirrors FloorViewer) */}
      <aside className={styles.panel}>
        <MultifloorRoutePanel
          buildingId={buildingId}
          floors={floorOptions}
          roomsByFloor={roomsByFloor}
          onResult={handleResult}
          onGoToAssembly={onGoToAssembly}
        />
        <div className={styles.layers}>
          <div className={styles.layersTitle}>Слои этажей</div>
          <div className={styles.pillList}>
            {orderedFloors.map((f) => {
              const drawable = f.has_mesh && f.placement !== null;
              const shown = drawable && visible.has(f.floor_id);
              const cls = !drawable
                ? `${styles.pill} ${styles.pillDisabled}`
                : shown
                  ? `${styles.pill} ${styles.pillActive}`
                  : styles.pill;
              return (
                <button
                  key={f.floor_id}
                  type="button"
                  className={cls}
                  disabled={!drawable}
                  onClick={() => toggle(f.floor_id)}
                  title={
                    drawable
                      ? `Этаж ${f.number} — показать/скрыть`
                      : `Этаж ${f.number} — нет 3D-модели`
                  }
                >
                  {f.number}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Right: big 3D viewer (model left untouched) */}
      <div className={styles.viewer}>
        <BuildingMeshViewer
          floors={renderable}
          roomsByFloor={roomsByFloor}
          routeSegments={segments}
          routeTransitions={transitions}
        />
      </div>
    </div>
  );
};

export default Multifloor3DRoutes;
