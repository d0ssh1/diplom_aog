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
      <div className={styles.uploadArea}>
        <div className={styles.uploadColumns}>
          {/* Left: drop zone */}
          <div className={styles.uploadPanel}>
            <h3 className={styles.uploadPanelTitle}>Источник плана</h3>
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
                {busy ? 'Загрузка...' : 'Перетащите файл или нажмите для выбора'}
              </span>
              <span className={styles.dropZoneHint}>JPG, PNG, PDF — до 50 МБ</span>
            </div>
            {localError && (
              <p style={{ color: '#cc0000', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                {localError}
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* Right: preview */}
          <div className={styles.uploadPanel}>
            <h3 className={styles.uploadPanelTitle}>Предварительный просмотр</h3>
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
                <span style={{ fontSize: '2rem' }}>🖼</span>
                <span className={styles.uploadHint}>Загрузите изображение плана этажа</span>
                <span className={styles.dropZoneHint}>
                  Рекомендуем загружать качественные фото или сканы схемы этажа
                </span>
              </div>
            )}
          </div>
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
