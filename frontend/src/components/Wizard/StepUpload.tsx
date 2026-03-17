import React, { useState } from 'react';
import { DropZone } from '../Upload/DropZone';
import { MetadataForm } from '../Upload/MetadataForm';
import type { UploadedFile } from '../../types/wizard';
import styles from './StepUpload.module.css';

interface StepUploadProps {
  files: UploadedFile[];
  onFilesSelect: (files: File[]) => void;
  onRemove: (id: string) => void;
  isUploading: boolean;
}

export const StepUpload: React.FC<StepUploadProps> = ({
  files,
  onFilesSelect,
  onRemove,
  isUploading,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const safeIndex = Math.min(activeIndex, Math.max(0, files.length - 1));
  const activeFile = files[safeIndex] ?? null;

  return (
    <div className={styles.step}>
      {/* Left panel */}
      <div className={styles.left}>
        <div className={styles.dropZoneWrap}>
          <DropZone onFilesSelect={onFilesSelect} isUploading={isUploading} />
        </div>

        {files.length > 1 && (
          <div className={styles.thumbnailStrip}>
            {files.map((f, i) => (
              <div
                key={f.id}
                className={`${styles.thumb} ${i === safeIndex ? styles.thumbActive : ''}`}
                onClick={() => setActiveIndex(i)}
              >
                <img src={f.url} alt={f.name} className={styles.thumbImg} />
                <p className={styles.thumbName}>{f.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className={styles.right}>
        <div className={styles.rightContent}>
          {activeFile ? (
            <>
              <div className={styles.previewCard}>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => onRemove(activeFile.id)}
                >
                  ×
                </button>
                <img src={activeFile.url} alt={activeFile.name} className={styles.previewImage} />
                <div className={styles.previewFooter}>
                  <span className={styles.fileName}>{activeFile.name}</span>
                  <span className={styles.statusReady}>Готово</span>
                </div>
              </div>

              <MetadataForm />
            </>
          ) : (
            <div className={styles.rightEmpty}>Загрузите файл</div>
          )}
        </div>
        <div className={styles.uploadCounter}>
          Загружено: {files.length} {files.length === 1 ? 'изображение' : files.length >= 2 && files.length <= 4 ? 'изображения' : 'изображений'}
        </div>
      </div>
    </div>
  );
};
