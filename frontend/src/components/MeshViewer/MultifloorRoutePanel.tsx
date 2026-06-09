// Route-building controls for the cross-floor 3D routes view (subfeature D):
// from/to floor + room pickers, a run button, a distance/time readout, and a
// not_aligned prompt. Self-contained (owns useMultifloorRoute); reports each
// result via onResult so the host can render the route in its 3D scene. Reusable
// in both the admin view and the end-user start screen.

import React, { useEffect, useMemo } from 'react';
import { useMultifloorRoute } from '../../hooks/useMultifloorRoute';
import type { MultifloorRouteResponse } from '../../types/buildingNav';
import type { Room3DApi } from '../../api/apiService';
import styles from './MultifloorRoutePanel.module.css';

export interface RouteFloorOption {
  floor_id: number;
  number: number;
}

interface Props {
  buildingId: number;
  floors: RouteFloorOption[];
  roomsByFloor: Record<number, Room3DApi[]>;
  onResult?: (result: MultifloorRouteResponse | null) => void;
  onGoToAssembly?: () => void;
}

function roomOptions(rooms: Room3DApi[] | undefined): Room3DApi[] {
  return (rooms ?? []).filter((r) => r.id !== undefined && r.id !== null);
}

export const MultifloorRoutePanel: React.FC<Props> = ({
  buildingId,
  floors,
  roomsByFloor,
  onResult,
  onGoToAssembly,
}) => {
  const route = useMultifloorRoute(buildingId);
  const {
    fromFloorId,
    setFromFloorId,
    fromRoom,
    setFromRoom,
    toFloorId,
    setToFloorId,
    toRoom,
    setToRoom,
    result,
    loading,
    error,
    run,
  } = route;

  useEffect(() => {
    onResult?.(result);
  }, [result, onResult]);

  // Rooms have globally-unique names, so the operator picks a room directly —
  // no floor step. The composite value `${floorId}:${roomId}` lets us set BOTH
  // the room and its floor (the route payload still needs the floor id).
  const allRooms = useMemo(() => {
    const out: { key: string; floorId: number; roomId: string; label: string }[] = [];
    for (const f of floors) {
      for (const r of roomOptions(roomsByFloor[f.floor_id])) {
        const roomId = String(r.id);
        out.push({
          key: `${f.floor_id}:${roomId}`,
          floorId: f.floor_id,
          roomId,
          label: r.name || roomId,
        });
      }
    }
    return out;
  }, [floors, roomsByFloor]);

  const fromValue = fromFloorId !== null && fromRoom ? `${fromFloorId}:${fromRoom}` : '';
  const toValue = toFloorId !== null && toRoom ? `${toFloorId}:${toRoom}` : '';

  const pickRoom = (
    value: string,
    setFloor: (n: number | null) => void,
    setRoom: (s: string) => void,
  ): void => {
    if (value === '') {
      setFloor(null);
      setRoom('');
      return;
    }
    const idx = value.indexOf(':');
    setFloor(Number(value.slice(0, idx)));
    setRoom(value.slice(idx + 1));
  };

  return (
    <div className={styles.panel}>
      <h3 className={styles.heading}>Построить маршрут</h3>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Откуда</span>
        <select
          className={styles.select}
          value={fromValue}
          onChange={(e) => pickRoom(e.target.value, setFromFloorId, setFromRoom)}
        >
          <option value="">Комната…</option>
          {allRooms.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Куда</span>
        <select
          className={styles.select}
          value={toValue}
          onChange={(e) => pickRoom(e.target.value, setToFloorId, setToRoom)}
        >
          <option value="">Комната…</option>
          {allRooms.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className={styles.runBtn}
        onClick={() => void run()}
        disabled={loading}
      >
        {loading ? 'Поиск…' : 'Построить'}
      </button>

      {error && <div className={styles.error}>{error}</div>}

      {result && result.status === 'success' && (
        <div className={styles.readout}>
          <div>
            Длина: <b>{(result.total_distance_meters ?? 0).toFixed(1)} м</b>
          </div>
          <div>
            Время: <b>{result.estimated_time_seconds ?? 0} с</b>
          </div>
          <div>Переходов: {result.transitions_used.length}</div>
        </div>
      )}
      {result && result.status === 'no_path' && (
        <div className={styles.warn}>Маршрут не найден.</div>
      )}
      {result && result.status === 'not_aligned' && (
        <div className={styles.warn}>
          {result.message || 'Этажи не выровнены.'}
          {onGoToAssembly && (
            <button type="button" className={styles.linkBtn} onClick={onGoToAssembly}>
              К сборке здания
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MultifloorRoutePanel;
