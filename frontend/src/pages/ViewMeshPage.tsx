/**
 * Страница просмотра 3D модели
 * 
 * Использует Three.js для рендеринга
 */

import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { reconstructionApi } from '../api/apiService';
import MeshViewer from '../components/MeshViewer';

// Three.js импорты будут добавлены при реализации
// import { Canvas } from '@react-three/fiber';
// import { OrbitControls, useGLTF } from '@react-three/drei';

interface MeshData {
  id: number;
  name: string;
  url: string | null;
  status: number;
}

function ViewMeshPage() {
  const { id } = useParams<{ id: string }>();
  const [meshData, setMeshData] = useState<MeshData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMeshData = async () => {
      if (!id) return;

      try {
        const data = await reconstructionApi.getReconstructionById(parseInt(id));
        setMeshData(data);
      } catch (err) {
        setError('Ошибка загрузки модели');
      } finally {
        setLoading(false);
      }
    };

    fetchMeshData();
  }, [id]);

  if (loading) {
    return <div className="loading-screen">Загрузка 3D модели...</div>;
  }

  if (error || !meshData) {
    return <div className="error-screen">{error || 'Модель не найдена'}</div>;
  }

  return (
    <div className="view-mesh-page">
      <header className="mesh-header">
        <h1>{meshData.name || `Модель #${meshData.id}`}</h1>
      </header>

      <main className="mesh-viewer">
        <div style={{ width: '100%', height: '100%' }}>
          {meshData.url ? (
             // Определяем формат по расширению URL
             <MeshViewer 
               url={meshData.url} 
               format={meshData.url.endsWith('.glb') ? 'glb' : 'obj'} 
             />
          ) : (
            <div className="placeholder-3d">
              <p>URL модели отсутствует</p>
            </div>
          )}
        </div>
      </main>

      <aside className="mesh-controls">
        <h3>Управление</h3>
        <ul>
          <li>🖱️ ЛКМ + движение — вращение</li>
          <li>🖱️ Колёсико — масштаб</li>
          <li>🖱️ ПКМ + движение — перемещение</li>
        </ul>
      </aside>
    </div>
  );
}

export default ViewMeshPage;
