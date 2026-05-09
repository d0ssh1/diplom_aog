import React, { useRef, useState, useCallback } from 'react';
import styles from './WizardStep.module.css';
import { uploadApi } from '../../api/apiService';

interface Step1UploadProps {
  schemaImageUrl: string | null;
  isLoading: boolean;
  onUploaded: (fileId: string, url: string) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const Step1Upload: React.FC<Step1UploadProps> = ({
  schemaImageUrl,
  isLoading,
  onUploaded,
  onNext,
  onBack,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(schemaImageUrl);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setLocalError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLocalError('Поддерживаются JPG, PNG, PDF');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setLocalError('Файл слишком большой (максимум 50 МБ)');
      return;
    }

    if (file.type !== 'application/pdf') {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
    setFileName(file.name);

    setUploading(true);
    try {
      const result = await uploadApi.uploadPlanPhoto(file);
      const fileId: string = result.file_id ?? result.id;
      const url: string = result.url ?? previewUrl ?? '';
      await onUploaded(fileId, url);
    } catch {
      setLocalError('Ошибка загрузки файла');
    } finally {
      setUploading(false);
    }
  }, [onUploaded, previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const busy = isLoading || uploading;
  const canNext = (schemaImageUrl !== null || previewUrl !== null) && !busy;

  return (
    <div className={styles.layout}>
      {/* Two-column: dark left panel + light center */}
      <div className={styles.uploadColumns}>
        {/* Left: drop zone */}
        <div className={styles.uploadPanel}>
          <div className={styles.uploadPanelTitle}>Источник плана</div>

          <div
            className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            aria-label="Загрузить файл"
          >
            <span className={styles.dropZoneIcon}>📁</span>
            <span className={styles.dropZoneText}>
              {busy ? 'Загрузка...' : 'Загрузите изображение плана этажа'}
            </span>
            <span className={styles.dropZoneHint}>JPG, PNG, PDF</span>
          </div>

          <button
            className={styles.uploadSelectBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            type="button"
          >
            Выбрать файл
          </button>

          {localError && (
            <p style={{ color: '#cc3300', fontSize: '0.75rem', marginTop: '0.5rem' }}>
              {localError}
            </p>
          )}

          <p className={styles.uploadRecommend}>
            Рекомендуем загружать качественные фото или сканы схемы этажа
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* Center: preview */}
        <div className={styles.uploadPanelCenter}>
          {previewUrl ? (
            <div className={styles.uploadPreview}>
              <img
                src={previewUrl}
                alt="Схема этажа"
                className={styles.uploadPreviewImg}
              />
              {fileName && <span className={styles.uploadPreviewName}>{fileName}</span>}
            </div>
          ) : (
            <div className={styles.uploadPreviewEmpty}>
              <span style={{ fontSize: '3rem', opacity: 0.3 }}>🖼</span>
              <span className={styles.uploadHint}>Загрузите изображение плана этажа</span>
            </div>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <button className={styles.btnBack} onClick={onBack} type="button">
          ← Назад
        </button>
        <span className={styles.footerHint}>Загрузите изображение плана этажа</span>
        <button
          className={styles.btnNext}
          onClick={onNext}
          disabled={!canNext}
          type="button"
        >
          Далее →
        </button>
      </footer>
    </div>
  );
};
