import React, { useState } from 'react';
import { Button } from '../UI/Button';
import styles from './StepSave.module.css';

interface StepSaveProps {
  onSave: (name: string, floorId: number) => Promise<void>;
  isLoading: boolean;
}

export const StepSave: React.FC<StepSaveProps> = ({ onSave, isLoading }) => {
  const [name, setName] = useState('');
  const [floorId, setFloorId] = useState<number>(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && floorId > 0) {
      onSave(name.trim(), floorId);
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
          <label className={styles.label} htmlFor="floor-id">
            ID этажа
          </label>
          <input
            id="floor-id"
            type="number"
            className={styles.input}
            value={floorId || ''}
            onChange={(e) => setFloorId(parseInt(e.target.value, 10) || 0)}
            min={1}
            placeholder="Введите ID этажа"
            disabled={isLoading}
          />
        </div>
        <Button variant="primary" type="submit" disabled={isLoading || !name.trim() || floorId <= 0}>
          {isLoading ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </form>
    </div>
  );
};
