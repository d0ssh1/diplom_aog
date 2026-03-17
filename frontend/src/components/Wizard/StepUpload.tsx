import React from 'react';
import { DropZone } from '../Upload/DropZone';
import { FileGrid } from '../Upload/FileGrid';
import type { UploadedFile } from '../../types/wizard';
import styles from './StepUpload.module.css';

interface StepUploadProps {
  files: UploadedFile[];
  onFileSelect: (file: File) => void;
  onRemove: (id: string) => void;
  isUploading: boolean;
}

export const StepUpload: React.FC<StepUploadProps> = ({
  files,
  onFileSelect,
  onRemove,
  isUploading,
}) => {
  return (
    <div className={styles.step}>
      <div className={styles.left}>
        <DropZone onFileSelect={onFileSelect} isUploading={isUploading} />
      </div>
      <div className={styles.right}>
        <FileGrid files={files} onRemove={onRemove} singleFile />
      </div>
    </div>
  );
};
