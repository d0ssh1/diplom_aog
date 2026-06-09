import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Boxes, Layers, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { useBuildings } from '../hooks/useBuildings';
import { Multifloor3DRoutes } from '../components/MeshViewer/Multifloor3DRoutes';
import type { Building } from '../types/hierarchy';
import styles from './Multifloor3DRoutesPage.module.css';

// Building picker landing for "3D-маршруты" (subfeature D). Pick a corpus, then
// the dedicated 3D window opens inline: the stacked building model + a route
// builder (from/to floor+room) that traces the shortest cross-floor path through
// the matched stairs/elevators. The inner view (Multifloor3DRoutes) is the
// reusable piece — the end-user start screen embeds the same component.

const getPluralFloors = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${count} этажей`;
  if (mod10 === 1) return `${count} этаж`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} этажа`;
  return `${count} этажей`;
};

export const Multifloor3DRoutesPage: React.FC = () => {
  const navigate = useNavigate();
  const { buildings, isLoading, error } = useBuildings();
  const [selected, setSelected] = useState<Building | null>(null);

  if (selected) {
    return (
      <div className={`${styles.page} ${styles.pageFill}`}>
        <div className={styles.darkHeader}>
          <button
            className={styles.backBtn}
            type="button"
            onClick={() => setSelected(null)}
            title="К списку корпусов"
          >
            <ArrowLeft size={18} /> Корпуса
          </button>
          <span className={styles.darkHeaderLabel}>3D-маршруты — {selected.name}</span>
          <button
            className={styles.darkHeaderClose}
            type="button"
            onClick={() => navigate('/admin')}
            title="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
        <div className={styles.viewerHost}>
          <Multifloor3DRoutes
            buildingId={selected.id}
            onGoToAssembly={() =>
              navigate(`/admin/buildings/${selected.id}/assembly`)
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.darkHeader}>
        <span className={styles.darkHeaderLabel}>3D-маршруты</span>
        <button
          className={styles.darkHeaderClose}
          type="button"
          onClick={() => navigate('/admin')}
          title="Закрыть"
        >
          <X size={20} />
        </button>
      </div>

      <div className={styles.content}>
        <div className={styles.inner}>
          <header className={styles.pageHeader}>
            <h1 className={styles.title}>3D-маршруты</h1>
            <p className={styles.subtitle}>
              Выберите корпус, чтобы открыть его 3D-модель и построить маршрут
              между этажами — кратчайший путь проложится через лестницы и лифты.
            </p>
          </header>

          {isLoading && <div className={styles.stateMsg}>Загрузка корпусов…</div>}

          {!isLoading && error && (
            <div className={`${styles.stateMsg} ${styles.stateError}`}>{error}</div>
          )}

          {!isLoading && !error && buildings.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Building2 size={64} strokeWidth={1} />
              </div>
              <h3 className={styles.emptyTitle}>Нет корпусов</h3>
              <p className={styles.emptyText}>
                Сначала создайте корпус и соберите его этажи на странице «Корпуса и
                этажи».
              </p>
              <button
                className={styles.btnPrimary}
                type="button"
                onClick={() => navigate('/admin/buildings')}
              >
                Перейти к корпусам
              </button>
            </div>
          )}

          {!isLoading && !error && buildings.length > 0 && (
            <div className={styles.list}>
              {buildings.map((building) => {
                const ready = building.floors_count >= 1;
                return (
                  <button
                    key={building.id}
                    type="button"
                    className={`${styles.card} ${ready ? '' : styles.cardDisabled}`}
                    onClick={() => {
                      if (ready) setSelected(building);
                    }}
                    disabled={!ready}
                    title={
                      ready
                        ? 'Открыть 3D-модель и построить маршрут'
                        : 'Сначала добавьте этажи в корпус'
                    }
                  >
                    <div className={styles.cardIcon}>
                      <Boxes size={22} />
                    </div>
                    <div className={styles.cardMain}>
                      <div className={styles.cardName}>{building.name}</div>
                      <div className={styles.cardCode}>Код: {building.code}</div>
                    </div>
                    <div className={styles.cardMeta}>
                      <span className={styles.floorsBadge}>
                        <Layers size={14} /> {getPluralFloors(building.floors_count)}
                      </span>
                      {ready ? (
                        <span className={styles.openHint}>
                          Открыть <ArrowRight size={16} />
                        </span>
                      ) : (
                        <span className={styles.needHint}>нужны этажи</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Multifloor3DRoutesPage;
