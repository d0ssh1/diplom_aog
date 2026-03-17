import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
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

  const handlePrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setActiveIndex((i) => Math.min(files.length - 1, i + 1));

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
                <button
                  type="button"
                  className={styles.thumbRemove}
                  onClick={(e) => { e.stopPropagation(); onRemove(f.id); }}
                >
                  <X size={10} />
                </button>
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
              <div className={styles.previewHeader}>
                <span className={styles.previewName}>{activeFile.name}</span>
                <button
                  type="button"
                  className={styles.previewRemove}
                  onClick={() => onRemove(activeFile.id)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className={styles.previewImgWrap}>
                <img src={activeFile.url} alt={activeFile.name} className={styles.previewImg} />
              </div>

              {files.length > 1 && (
                <div className={styles.navArrows}>
                  <button type="button" onClick={handlePrev} disabled={safeIndex === 0} className={styles.arrowBtn}>
                    <ChevronLeft size={20} />
                  </button>
                  <span className={styles.navCount}>{safeIndex + 1} / {files.length}</span>
                  <button type="button" onClick={handleNext} disabled={safeIndex === files.length - 1} className={styles.arrowBtn}>
                    <ChevronRight size={20} />
                  </button>
                </div>
              )}

              <MetadataForm />
            </>
          ) : (
            <div className={styles.rightEmpty}>Загрузите файл</div>
          )}
        </div>
        <div className={styles.rightStatus}>
          Загружено {files.length} {files.length === 1 ? 'изображение' : files.length >= 2 && files.length <= 4 ? 'изображения' : 'изображений'}
        </div>
      </div>
    </div>
  );
};
