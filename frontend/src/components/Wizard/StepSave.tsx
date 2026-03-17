import React, { useState } from 'react';
import { Button } from '../UI/Button';
import styles from './StepSave.module.css';

interface StepSaveProps {
  onSave: (name: string) => Promise<void>;
  isLoading: boolean;
}

export const StepSave: React.FC<StepSaveProps> = ({ onSave, isLoading }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
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
        <Button variant="primary" type="submit" disabled={isLoading || !name.trim()}>
          {isLoading ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </form>
    </div>
  );
};
