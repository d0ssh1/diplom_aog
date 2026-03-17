import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { reconstructionApi } from '../api/apiService';
import { Button } from '../components/UI/Button';
import type { ReconstructionCard } from '../types/dashboard';
import styles from './DashboardPage.module.css';
import buildingBlur from '../assets/building-blur.png';

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
    return <div className={styles.loading}>Загрузка...</div>;
  }

  if (reconstructions.length === 0) {
    return (
      <div className={styles.empty} style={{ backgroundImage: `url(${buildingBlur})` }}>
        <div className={styles.emptyIcon}>
          <X size={40} />
        </div>
        <p className={styles.emptyText}>Нет загруженных планов</p>
        <Button variant="primary" onClick={() => navigate('/upload')}>
          Начать
        </Button>
        {error && <p className={styles.error}>{error}</p>}
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
            onClick={() => navigate(`/mesh/${r.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/mesh/${r.id}`)}
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(r.id);
                }}
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
