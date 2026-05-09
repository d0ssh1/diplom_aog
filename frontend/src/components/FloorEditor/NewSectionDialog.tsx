/**
 * NewSectionDialog — displayed as a RIGHT SIDE PANEL (not a centered modal overlay).
 *
 * Per mockup screen 4: the panel sits flush against the right edge of the
 * working area, takes real layout space (does NOT overlap the canvas), and
 * includes an optional "Описание" textarea.
 *
 * Note on "Описание": this field is client-side only. The backend section
 * API does not have a description field (ADR-29); the value is stored in
 * component state for display purposes only and is NOT sent to the server.
 * If backend support is added in a future phase, pass it through
 * SectionPayloadItem.
 */
import React, { useState, useEffect, useRef } from 'react';
import styles from './NewSectionDialog.module.css';

interface NewSectionDialogProps {
  open: boolean;
  initialNumber: number | null;
  takenNumbers: number[];
  onConfirm: (number: number, description: string) => void;
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
  const [description, setDescription] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(String(initialNumber ?? 1));
      setDescription('');
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [open, initialNumber]);

  if (!open) return null;

  const num = parseInt(value, 10);
  const isValid = !isNaN(num) && num >= 1;
  const isDuplicate = isValid && takenNumbers.includes(num);
  const canConfirm = isValid && !isDuplicate;

  const handleConfirm = () => {
    if (canConfirm) onConfirm(num, description);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canConfirm) handleConfirm();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className={styles.panel} role="complementary" aria-label="Новый отсек">
      <div className={styles.panelHeader}>
        <h3 className={styles.title}>Новый отсек</h3>
        <button
          className={styles.closeBtn}
          onClick={onCancel}
          type="button"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>

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

      <div className={styles.field}>
        <label className={styles.label} htmlFor="section-desc-input">
          Описание <span className={styles.optional}>(необязательно)</span>
        </label>
        <textarea
          id="section-desc-input"
          className={styles.textarea}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Например: Аудиторный корпус A"
        />
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
  );
};
