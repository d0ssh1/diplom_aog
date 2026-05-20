import React, { useState, useCallback } from 'react';
import MeshViewer from '../../components/MeshViewer';
import { NavigationPath } from '../MeshViewer/NavigationPath';
import { MultifloorNavigationPath } from '../MeshViewer/MultifloorNavigationPath';
import { RouteBottomBar } from '../MeshViewer/RouteBottomBar';
import { reconstructionApi, navigationApi } from '../../api/apiService';
import type { RoomAnnotation } from '../../types/wizard';
import type { MultifloorRouteResponse } from '../../types/transitions';
import styles from './StepView3D.module.css';

interface RouteResult {
  status: string;
  from_room?: string;
  to_room?: string;
  total_distance_meters?: number;
  estimated_time_seconds?: number;
  coordinates?: number[][];
  message?: string;
  from_room_3d?: { position: [number, number, number]; size: [number, number, number] };
  to_room_3d?: { position: [number, number, number]; size: [number, number, number] };
}

interface StepView3DProps {
  meshUrl: string | null;
  reconstructionId: number | null;
  navGraphId: string | null;
  rooms: RoomAnnotation[];
  onNext?: () => void;
  onPrev?: () => void;
  isNextDisabled?: boolean;
  nextLabel?: string;
  // Optional multifloor props
  buildingId?: string;
  toReconstructionId?: number;
}

export const StepView3D: React.FC<StepView3DProps> = ({
  meshUrl,
  reconstructionId,
  navGraphId,
  rooms,
  onNext,
  onPrev,
  isNextDisabled,
  buildingId,
  toReconstructionId,
}) => {
  const [routeCoords, setRouteCoords] = useState<number[][] | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [multifloorResult, setMultifloorResult] = useState<MultifloorRouteResponse | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [fromRoom, setFromRoom] = useState<string>('');
  const [toRoom, setToRoom] = useState<string>('');

  const isMultifloor =
    buildingId != null &&
    toReconstructionId != null &&
    reconstructionId != null &&
    toReconstructionId !== reconstructionId;

  const handleFindRoute = useCallback(async () => {
    if (!fromRoom || !toRoom || fromRoom === toRoom) return;
    setIsRoutingLoading(true);
    setRouteCoords(null);
    setRouteResult(null);
    setMultifloorResult(null);

    try {
      if (isMultifloor && buildingId && reconstructionId != null && toReconstructionId != null) {
        const result = await navigationApi.multifloorRoute({
          building_id: buildingId,
          from_reconstruction_id: reconstructionId,
          from_room_id: fromRoom,
          to_reconstruction_id: toReconstructionId,
          to_room_id: toRoom,
        });
        setMultifloorResult(result);
      } else {
        if (!navGraphId) return;
        const result = await reconstructionApi.findRoute(navGraphId, fromRoom, toRoom);
        setRouteResult(result);
        if (result.status === 'success' && result.coordinates) {
          setRouteCoords(result.coordinates);
        }
      }
    } catch {
      setRouteResult({ status: 'error', message: 'Ошибка запроса маршрута' });
    } finally {
      setIsRoutingLoading(false);
    }
  }, [navGraphId, fromRoom, toRoom, isMultifloor, buildingId, reconstructionId, toReconstructionId]);

  if (!meshUrl) {
    return <div className={styles.empty}>3D-модель не готова</div>;
  }

  const format = meshUrl.endsWith('.glb') ? 'glb' : 'obj';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <MeshViewer url={meshUrl} format={format}>
          {multifloorResult && multifloorResult.status === 'success' ? (
            <MultifloorNavigationPath
              pathSegments={multifloorResult.path_segments}
              transitionsUsed={multifloorResult.transitions_used}
            />
          ) : (
            <NavigationPath
              coordinates={routeCoords}
              fromRoom3D={routeResult?.from_room_3d}
              toRoom3D={routeResult?.to_room_3d}
              fromRoomName={routeResult?.from_room}
              toRoomName={routeResult?.to_room}
            />
          )}
        </MeshViewer>

        {(routeResult?.status === 'no_path' || multifloorResult?.status === 'no_path') && (
          <div className={styles.errorHud}>
            Маршрут не найден. Проверьте разметку дверей.
          </div>
        )}
      </div>

      <RouteBottomBar
        rooms={rooms}
        fromRoom={fromRoom}
        toRoom={toRoom}
        onFromChange={setFromRoom}
        onToChange={setToRoom}
        onFindRoute={handleFindRoute}
        isLoading={isRoutingLoading}
        onPrev={onPrev || (() => {})}
        onNext={onNext || (() => {})}
        isNextDisabled={!!isNextDisabled}
      />
    </div>
  );
};
