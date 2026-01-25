/**
 * Страница списка реконструкций
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reconstructionApi } from '../api/apiService';

interface ReconstructionItem {
  id: number;
  name: string;
}

function ReconstructionsListPage() {
  const [reconstructions, setReconstructions] = useState<ReconstructionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReconstructions = async () => {
      try {
        const data = await reconstructionApi.getReconstructions();
        setReconstructions(data);
      } catch (err) {
        console.error('Ошибка загрузки списка');
      } finally {
        setLoading(false);
      }
    };

    fetchReconstructions();
  }, []);

  return (
    <div className="reconstructions-list-page">
      <header className="page-header">
        <h1>Реконструкции</h1>
        <Link to="/reconstructions/add" className="btn-add">
          + Создать
        </Link>
      </header>

      <main className="list-content">
        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : reconstructions.length === 0 ? (
          <div className="empty-state">
            <p>Нет сохранённых реконструкций</p>
            <Link to="/reconstructions/add">Создать первую</Link>
          </div>
        ) : (
          <ul className="reconstruction-list">
            {reconstructions.map((item) => (
              <li key={item.id} className="reconstruction-item">
                <Link to={`/mesh/${item.id}`}>
                  <span className="item-name">{item.name}</span>
                  <span className="item-arrow">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

export default ReconstructionsListPage;
