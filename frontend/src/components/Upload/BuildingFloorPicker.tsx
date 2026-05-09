import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBuildings } from '../../hooks/useBuildings';
import { useFloors } from '../../hooks/useFloors';
import styles from './BuildingFloorPicker.module.css';

interface BuildingFloorPickerProps {
  selectedBuildingId: number | null;
  selectedFloorId: number | null;
  onChange: (data: { buildingId: number | null; floorId: number | null }) => void;
  disabled?: boolean;
}

export const BuildingFloorPicker: React.FC<BuildingFloorPickerProps> = ({
  selectedBuildingId,
  selectedFloorId,
  onChange,
  disabled = false,
}) => {
  const { buildings, isLoading: buildingsLoading } = useBuildings();
  const { floors, isLoading: floorsLoading, loadForBuilding } = useFloors();

  // Load floors when building changes
  useEffect(() => {
    if (selectedBuildingId !== null) {
      void loadForBuilding(selectedBuildingId);
    }
  }, [selectedBuildingId, loadForBuilding]);

  const handleBuildingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const buildingId = value === '' ? null : parseInt(value, 10);
    // Reset floor when building changes
    onChange({ buildingId, floorId: null });
  };

  const handleFloorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const floorId = value === '' ? null : parseInt(value, 10);
    onChange({ buildingId: selectedBuildingId, floorId });
  };

  if (buildingsLoading) {
    return <div className={styles.loading}>Загрузка корпусов...</div>;
  }

  if (buildings.length === 0) {
    return (
      <div className={styles.empty}>
        <span>Нет доступных корпусов.</span>
        <Link to="/admin/buildings" className={styles.createLink}>
          Создать корпус
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.picker}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="bfp-building">
          Корпус
        </label>
        <select
          id="bfp-building"
          className={styles.select}
          value={selectedBuildingId ?? ''}
          onChange={handleBuildingChange}
          disabled={disabled}
        >
          <option value="">— выберите корпус —</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} — {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="bfp-floor">
          Этаж
        </label>
        {selectedBuildingId === null ? (
          <select className={styles.select} disabled>
            <option value="">— сначала выберите корпус —</option>
          </select>
        ) : floorsLoading ? (
          <select className={styles.select} disabled>
            <option value="">Загрузка этажей...</option>
          </select>
        ) : floors.length === 0 ? (
          <div className={styles.empty}>
            <span>Нет этажей в этом корпусе.</span>
            <Link to="/admin/buildings" className={styles.createLink}>
              Добавить этаж
            </Link>
          </div>
        ) : (
          <select
            id="bfp-floor"
            className={styles.select}
            value={selectedFloorId ?? ''}
            onChange={handleFloorChange}
            disabled={disabled}
          >
            <option value="">— выберите этаж —</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                Этаж {f.number}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};
