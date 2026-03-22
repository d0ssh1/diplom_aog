import React, { useState } from 'react';
import { Button } from '../UI/Button';
import styles from './StepSave.module.css';

interface StepSaveProps {
  onSave: (name: string, buildingId: string, floorNumber: number) => Promise<void>;
  isLoading: boolean;
}

export const StepSave: React.FC<StepSaveProps> = ({ onSave, isLoading }) => {
  const [name, setName] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [floorNumber, setFloorNumber] = useState<number>(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && buildingId.trim()) {
      onSave(name.trim(), buildingId.trim(), floorNumber);
    }
  };

  return (
    <div className={styles.step}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h2 className={styles.title}>Сохранить план</h2>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="plan-name">
            Название
          </label>
          <input
            id="plan-name"
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введите название"
            disabled={isLoading}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="building-id">
            Корпус (A, B, C)
          </label>
          <input
            id="building-id"
            type="text"
            className={styles.input}
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value.toUpperCase())}
            placeholder="A"
            maxLength={10}
            disabled={isLoading}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="floor-number">
            Этаж
          </label>
          <input
            id="floor-number"
            type="number"
            className={styles.input}
            value={floorNumber}
            onChange={(e) => setFloorNumber(parseInt(e.target.value, 10) || 1)}
            min={0}
            max={50}
            disabled={isLoading}
          />
        </div>
        <Button variant="primary" type="submit" disabled={isLoading || !name.trim() || !buildingId.trim()}>
          {isLoading ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </form>
    </div>
  );
};
