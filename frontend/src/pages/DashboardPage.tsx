import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Layout } from 'lucide-react';
import { reconstructionApi } from '../api/apiService';
import type { ReconstructionCard } from '../types/dashboard';
import styles from './DashboardPage.module.css';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [reconstructions, setReconstructions] = useState<ReconstructionCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await reconstructionApi.getReconstructions();
        setReconstructions(data as ReconstructionCard[]);
      } catch {
        setError('Ошибка загрузки списка');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await reconstructionApi.deleteReconstruction(id);
      setReconstructions((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError('Ошибка удаления');
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>SYS.LOADING...</div>;
  }

  if (reconstructions.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyPattern} />
        <div className={styles.emptyBox}>
          <div className={styles.emptyIcon}>
            <Layout size={80} strokeWidth={1} />
          </div>
          <h3 className={styles.emptyTitle}>Рабочая область пуста</h3>
          <div className={styles.emptyDivider} />
          <p className={styles.emptyMsg}>SYS.MSG: Требуется загрузка исходных данных для начала работы</p>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.startBtn} onClick={() => navigate('/upload')}>
            Начать работу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.grid}>
        {reconstructions.map((r) => (
          <div
            key={r.id}
            className={styles.card}
            onClick={() => navigate(`/admin/mesh/${r.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/mesh/${r.id}`)}
          >
            <div className={styles.preview}>
              {r.url ? (
                <img src={r.url} alt={r.name} className={styles.previewImg} />
              ) : (
                <div className={styles.previewPlaceholder} />
              )}
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                title="Удалить"
              >
                <X size={14} />
              </button>
            </div>
            <p className={styles.cardName}>{r.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardPage;
