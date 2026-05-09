import React, { useState, useEffect, useCallback } from 'react';
import { reconstructionApi, type ReconstructionListItem } from '../../api/apiService';
import type { Building, Floor } from '../../types/hierarchy';
import { floorsApi } from '../../api/buildingsApi';
import styles from './PlanGalleryPicker.module.css';

interface PlanGalleryPickerProps {
  buildings: Building[];
  selectedReconstructionId: number | null;
  onSelect: (id: number) => void;
}

export const PlanGalleryPicker: React.FC<PlanGalleryPickerProps> = ({
  buildings,
  selectedReconstructionId,
  onSelect,
}) => {
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<string>('');
  const [floorFilter, setFloorFilter] = useState<string>('');
  const [floors, setFloors] = useState<Floor[]>([]);
  const [reconstructions, setReconstructions] = useState<ReconstructionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load floors when building changes
  useEffect(() => {
    if (!buildingFilter) {
      setFloors([]);
      setFloorFilter('');
      return;
    }
    const building = buildings.find((b) => b.code === buildingFilter);
    if (!building) return;
    void floorsApi.listByBuilding(building.id).then((data) => {
      setFloors(data);
      setFloorFilter('');
    });
  }, [buildingFilter, buildings]);

  const fetchRecons = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: Parameters<typeof reconstructionApi.getReconstructions>[0] = {
        status: 3,
      };
      if (buildingFilter) filters.buildingCode = buildingFilter;
      if (floorFilter) filters.floorId = parseInt(floorFilter, 10);
      if (search) filters.search = search;
      const data = await reconstructionApi.getReconstructions(filters);
      setReconstructions(data);
    } catch {
      setReconstructions([]);
    } finally {
      setIsLoading(false);
    }
  }, [buildingFilter, floorFilter, search]);

  useEffect(() => {
    void fetchRecons();
  }, [fetchRecons]);

  return (
    <div className={styles.wrap}>
      {/* Filters */}
      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={buildingFilter}
          onChange={(e) => setBuildingFilter(e.target.value)}
        >
          <option value="">Все здания</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.code}>
              Корпус {b.code}
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
          disabled={!buildingFilter}
        >
          <option value="">Все этажи</option>
          {floors.map((f) => (
            <option key={f.id} value={String(f.id)}>
              Этаж {f.number}
            </option>
          ))}
        </select>
      </div>

      {/* Gallery */}
      {isLoading ? (
        <div className={styles.loading}>Загрузка...</div>
      ) : reconstructions.length === 0 ? (
        <div className={styles.empty}>Нет планов</div>
      ) : (
        <div className={styles.grid}>
          {reconstructions.map((r) => {
            const isSelected = r.id === selectedReconstructionId;
            return (
              <button
                key={r.id}
                className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
                onClick={() => onSelect(r.id)}
                type="button"
              >
                {r.preview_url ? (
                  <img
                    src={r.preview_url}
                    alt={r.name ?? 'Plan'}
                    className={styles.cardThumb}
                  />
                ) : (
                  <div className={styles.cardThumbEmpty}>🖼</div>
                )}
                <div className={styles.cardInfo}>
                  <span className={styles.cardName}>{r.name ?? '—'}</span>
                  {r.floor && (
                    <span className={styles.cardFloor}>
                      Корпус {r.floor.building_code} · Этаж {r.floor.number}
                    </span>
                  )}
                </div>
                {isSelected && <span className={styles.checkmark}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
