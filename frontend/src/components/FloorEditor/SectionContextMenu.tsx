import React, { useEffect, useRef } from 'react';
import styles from './SectionContextMenu.module.css';

interface SectionContextMenuProps {
  x: number;
  y: number;
  sectionNumber: number;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const SectionContextMenu: React.FC<SectionContextMenuProps> = ({
  x,
  y,
  sectionNumber,
  onRename,
  onDelete,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Auto-flip to avoid viewport overflow
  const style: React.CSSProperties = {
    left: x,
    top: y,
  };
  if (x + 200 > window.innerWidth) {
    style.left = x - 200;
  }
  if (y + 120 > window.innerHeight) {
    style.top = y - 120;
  }

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={style}
      role="menu"
      aria-label={`Меню отсека ${sectionNumber}`}
    >
      <button
        className={styles.item}
        onClick={() => { onRename(); onClose(); }}
        type="button"
        role="menuitem"
      >
        <span className={styles.icon}>✏</span>
        Изменить номер
      </button>
      <button
        className={`${styles.item} ${styles.itemDanger}`}
        onClick={() => { onDelete(); onClose(); }}
        type="button"
        role="menuitem"
      >
        <span className={styles.icon}>🗑</span>
        Удалить отсек
      </button>
    </div>
  );
};
