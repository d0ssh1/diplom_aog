import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../UI/Button';
import styles from './DropZone.module.css';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
  accept?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFileSelect,
  isUploading,
  accept = 'image/*',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <div className={styles.zone} onDragOver={handleDragOver} onDrop={handleDrop}>
      <Upload size={48} className={styles.icon} />
      <p className={styles.text}>Перетащите для загрузки</p>
      <Button
        variant="primary"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? 'Загрузка...' : 'Выбрать файлы'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className={styles.hidden}
        onChange={handleChange}
      />
    </div>
  );
};
