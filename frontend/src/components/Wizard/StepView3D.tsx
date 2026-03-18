import React, { useState, useCallback } from 'react';
import MeshViewer from '../../components/MeshViewer';
import { NavigationPath } from '../MeshViewer/NavigationPath';
import { RoutePanel } from '../MeshViewer/RoutePanel';
import { reconstructionApi } from '../../api/apiService';
import type { RoomAnnotation } from '../../types/wizard';
import styles from './StepView3D.module.css';

interface RouteResult {
  status: string;
  from_room?: string;
  to_room?: string;
  total_distance_meters?: number;
  estimated_time_seconds?: number;
  coordinates?: number[][];
  message?: string;
}

interface StepView3DProps {
  meshUrl: string | null;
  reconstructionId: number | null;  // eslint-disable-line @typescript-eslint/no-unused-vars
  navGraphId: string | null;
  rooms: RoomAnnotation[];
}

export const StepView3D: React.FC<StepView3DProps> = ({
  meshUrl,
  reconstructionId: _reconstructionId,
  navGraphId,
  rooms,
}) => {
  const [routeCoords, setRouteCoords] = useState<number[][] | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);

  const handleFindRoute = useCallback(async (fromId: string, toId: string) => {
    if (!navGraphId) return;
    setIsRoutingLoading(true);
    setRouteCoords(null);
    setRouteResult(null);
    try {
      const result = await reconstructionApi.findRoute(navGraphId, fromId, toId);
      setRouteResult(result);
      if (result.status === 'success' && result.coordinates) {
        setRouteCoords(result.coordinates);
      }
    } catch {
      setRouteResult({ status: 'error', message: 'Ошибка запроса маршрута' });
    } finally {
      setIsRoutingLoading(false);
    }
  }, [navGraphId]);

  if (!meshUrl) {
    return <div className={styles.empty}>3D-модель не готова</div>;
  }

  const format = meshUrl.endsWith('.glb') ? 'glb' : 'obj';

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <MeshViewer url={meshUrl} format={format}>
          <NavigationPath coordinates={routeCoords} />
        </MeshViewer>
      </div>
      <RoutePanel
        rooms={rooms}
        onFindRoute={handleFindRoute}
        isLoading={isRoutingLoading}
        routeResult={routeResult}
      />
    </div>
  );
};
