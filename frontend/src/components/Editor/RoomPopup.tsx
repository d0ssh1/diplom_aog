import React, { useEffect, useRef, useState } from 'react';
import styles from './RoomPopup.module.css';

const TYPE_LABELS: Record<string, string> = {
  room: 'Кабинет',
  staircase: 'Лестница',
  elevator: 'Лифт',
  corridor: 'Коридор',
};

interface RoomPopupProps {
  position: { x: number; y: number };
  roomType: 'room' | 'staircase' | 'elevator' | 'corridor';
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export const RoomPopup: React.FC<RoomPopupProps> = ({
  position,
  roomType,
  onConfirm,
  onCancel,
}) => {
  const [inputValue, setInputValue] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click outside → cancel
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onCancel]);

  // Keyboard: Escape → cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleConfirm = () => {
    const name = roomType === 'room' ? inputValue.trim() : TYPE_LABELS[roomType];
    if (roomType === 'room' && !name) return;
    onConfirm(name);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleConfirm();
  };

  return (
    <div
      ref={popupRef}
      className={styles.popup}
      style={{ left: position.x, top: position.y }}
    >
      {roomType === 'room' && (
        <>
          <p className={styles.label}>Номер кабинета</p>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="например, 301"
          />
        </>
      )}
      <button type="button" className={styles.confirmBtn} onClick={handleConfirm}>
        Подтвердить
      </button>
    </div>
  );
};
