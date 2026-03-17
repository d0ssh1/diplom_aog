import React from 'react';
import MeshViewer from '../../components/MeshViewer';
import styles from './StepView3D.module.css';

interface StepView3DProps {
  meshUrl: string | null;
  reconstructionId: number | null;
}

export const StepView3D: React.FC<StepView3DProps> = ({ meshUrl }) => {
  if (!meshUrl) {
    return <div className={styles.empty}>3D-модель не готова</div>;
  }

  const format = meshUrl.endsWith('.glb') ? 'glb' : 'obj';

  return (
    <div className={styles.step}>
      <MeshViewer url={meshUrl} format={format} />
    </div>
  );
};
