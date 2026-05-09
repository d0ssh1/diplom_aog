import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MeshViewer from '../components/MeshViewer';
import { BuildingFloorSectionSelector } from '../components/FloorViewer/BuildingFloorSectionSelector';
import { FloorMinimap } from '../components/FloorViewer/FloorMinimap';
import { useFloorViewer } from '../hooks/useFloorViewer';
import styles from './FloorViewerPage.module.css';

/** Simple zoom via Three.js camera: exposed via wheel events on container */
const ZoomControls: React.FC<{
  onZoomIn: () => void;
  onZoomOut: () => void;
}> = ({ onZoomIn, onZoomOut }) => (
  <div className={styles.zoomControls}>
    <button type="button" className={styles.zoomBtn} onClick={onZoomIn} title="Приблизить">
      +
    </button>
    <button type="button" className={styles.zoomBtn} onClick={onZoomOut} title="Отдалить">
      −
    </button>
  </div>
);

export const FloorViewerPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    catalog,
    isLoading,
    error,
    selectedBuildingId,
    selectedFloorId,
    selectedSectionId,
    visibleFloors,
    visibleSections,
    activeMeshUrl,
    selectBuilding,
    selectFloor,
    selectSection,
    planRoute,
    routeError,
    highlightedSectionIds,
  } = useFloorViewer();

  const [startPoint, setStartPoint] = useState('');
  const [endPoint, setEndPoint] = useState('');
  const [isRouting, setIsRouting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show toast when routeError appears
  useEffect(() => {
    if (routeError) {
      setShowToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowToast(false), 4000);
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [routeError]);

  const handlePlanRoute = useCallback(async () => {
    if (!startPoint.trim() || !endPoint.trim()) return;
    setIsRouting(true);
    try {
      await planRoute(startPoint.trim(), endPoint.trim());
    } finally {
      setIsRouting(false);
    }
  }, [planRoute, startPoint, endPoint]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') void handlePlanRoute();
    },
    [handlePlanRoute],
  );

  // Zoom: simulate wheel events on the canvas container
  const viewerRef = useRef<HTMLDivElement>(null);

  const fireWheelEvent = useCallback((delta: number) => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      deltaY: delta,
      deltaMode: 0,
    });
    canvas.dispatchEvent(event);
  }, []);

  const handleZoomIn = useCallback(() => fireWheelEvent(-100), [fireWheelEvent]);
  const handleZoomOut = useCallback(() => fireWheelEvent(100), [fireWheelEvent]);

  // Derive selected building code for header
  const selectedBuilding = catalog.find((b) => b.id === selectedBuildingId);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>Загрузка каталога...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>{error}</div>
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>Контент пока не загружен</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ─── Header ─── */}
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate('/')}
        >
          ← ДВФУ
        </button>
        {selectedBuilding && (
          <>
            <span className={styles.headerSeparator}>&gt;</span>
            <span className={styles.headerTitle}>Корпус {selectedBuilding.code}</span>
          </>
        )}
      </header>

      {/* ─── Body ─── */}
      <div className={styles.body}>
        {/* Left panel */}
        <aside className={styles.leftPanel}>
          {/* Route inputs */}
          <div className={styles.routeSection}>
            <span className={styles.routeTitle}>Маршрут</span>
            <input
              type="text"
              className={styles.routeInput}
              placeholder="Начальная точка (напр. D304)"
              value={startPoint}
              onChange={(e) => setStartPoint(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <input
              type="text"
              className={styles.routeInput}
              placeholder="Конечная точка (напр. D712)"
              value={endPoint}
              onChange={(e) => setEndPoint(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className={styles.routeBtn}
              onClick={() => void handlePlanRoute()}
              disabled={isRouting || !startPoint.trim() || !endPoint.trim()}
            >
              {isRouting ? 'Поиск...' : 'Построить маршрут'}
            </button>
          </div>

          <div className={styles.divider} />

          {/* Building/Floor/Section selector */}
          <div className={styles.selectorSection}>
            <BuildingFloorSectionSelector
              buildings={catalog}
              visibleFloors={visibleFloors}
              visibleSections={visibleSections}
              selectedBuildingId={selectedBuildingId}
              selectedFloorId={selectedFloorId}
              selectedSectionId={selectedSectionId}
              onSelectBuilding={selectBuilding}
              onSelectFloor={selectFloor}
              onSelectSection={selectSection}
            />
          </div>

          <div className={styles.divider} />

          {/* Minimap */}
          <div className={styles.minimapSection}>
            <span className={styles.minimapTitle}>Схема этажа</span>
            <FloorMinimap
              sections={visibleSections}
              activeSectionId={selectedSectionId}
              highlightedSectionIds={highlightedSectionIds}
              onSelectSection={selectSection}
            />
          </div>
        </aside>

        {/* Right panel (3D viewer) */}
        <main className={styles.rightPanel}>
          <div className={styles.viewerContainer} ref={viewerRef}>
            {activeMeshUrl ? (
              <MeshViewer url={activeMeshUrl} format="glb" />
            ) : (
              <div className={styles.placeholder}>Выберите отсек</div>
            )}
          </div>

          {/* Zoom controls (only meaningful when mesh is shown) */}
          {activeMeshUrl && (
            <ZoomControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
          )}

          {/* Route error toast */}
          {showToast && routeError && (
            <div className={styles.toast}>{routeError}</div>
          )}
        </main>
      </div>
    </div>
  );
};

export default FloorViewerPage;
