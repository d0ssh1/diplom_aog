import React, { useState, useEffect, useRef } from 'react';
import styles from './NewSectionDialog.module.css';

interface NewSectionDialogProps {
  open: boolean;
  initialNumber: number | null;
  takenNumbers: number[];
  onConfirm: (number: number) => void;
  onCancel: () => void;
}

export const NewSectionDialog: React.FC<NewSectionDialogProps> = ({
  open,
  initialNumber,
  takenNumbers,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState<string>(String(initialNumber ?? 1));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(String(initialNumber ?? 1));
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [open, initialNumber]);

  if (!open) return null;

  const num = parseInt(value, 10);
  const isValid = !isNaN(num) && num >= 1;
  const isDuplicate = isValid && takenNumbers.includes(num);
  const canConfirm = isValid && !isDuplicate;

  const handleConfirm = () => {
    if (canConfirm) onConfirm(num);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canConfirm) handleConfirm();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Новый отсек"
      >
        <h3 className={styles.title}>Новый отсек</h3>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="section-number-input">
            Номер отсека
          </label>
          <input
            id="section-number-input"
            ref={inputRef}
            className={`${styles.input} ${isDuplicate ? styles.inputError : ''}`}
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isDuplicate && (
            <p className={styles.error}>Отсек с номером {num} уже существует</p>
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.btnCancel} onClick={onCancel} type="button">
            Отмена
          </button>
          <button
            className={styles.btnConfirm}
            onClick={handleConfirm}
            disabled={!canConfirm}
            type="button"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
};
