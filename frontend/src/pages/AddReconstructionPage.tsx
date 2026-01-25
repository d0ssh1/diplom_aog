/**
 * Страница добавления реконструкции
 * 
 * Workflow:
 * 1. Загрузка изображения плана
 * 2. Расчёт маски (бинаризация)
 * 3. Редактирование маски
 * 4. Расчёт линий Хафа
 * 5. Построение 3D модели
 * 6. Сохранение
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadApi, reconstructionApi } from '../api/apiService';

import MaskEditor from '../components/MaskEditor';
import CropSelector, { CropRect } from '../components/CropSelector';

// Статусы процесса
type ProcessStep = 'upload' | 'mask' | 'hough' | 'mesh' | 'save';

// Helper to crop image
const generateCroppedImage = (src: string, crop: CropRect): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const w = img.width;
            const h = img.height;
            
            canvas.width = w * crop.width;
            canvas.height = h * crop.height;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            ctx.drawImage(
                img,
                w * crop.x, h * crop.y, w * crop.width, h * crop.height,
                0, 0, canvas.width, canvas.height
            );
            
            resolve(canvas.toDataURL());
        };
        img.crossOrigin = "anonymous";
        img.src = src;
    });
};

// Helper: rotate image
const generateRotatedImage = (src: string, rotation: number): Promise<string> => {
    if (rotation === 0) return Promise.resolve(src);
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Swap dimensions for 90/270
            if (rotation % 180 !== 0) {
                canvas.width = img.height;
                canvas.height = img.width;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            ctx.translate(canvas.width/2, canvas.height/2);
            ctx.rotate(rotation * Math.PI / 180);
            ctx.drawImage(img, -img.width/2, -img.height/2);
            
            resolve(canvas.toDataURL());
        };
        img.crossOrigin = "anonymous";
        img.src = src;
    });
};

function AddReconstructionPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<ProcessStep>('upload');
  const [planFileId, setPlanFileId] = useState<string | null>(null);
  const [planUrl, setPlanUrl] = useState<string>(''); // Добавляем URL плана
  const [maskFileId, setMaskFileId] = useState<string | null>(null);
  const [meshId, setMeshId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconstructionName, setReconstructionName] = useState<string>('');
  const [meshUrl, setMeshUrl] = useState<string | null>(null);
  const [showCropSelector, setShowCropSelector] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [croppedPlanUrl, setCroppedPlanUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [rotatedPlanUrl, setRotatedPlanUrl] = useState<string | null>(null);

  // Загрузка изображения плана
  const handlePlanUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const response = await uploadApi.uploadPlanPhoto(file);
      setPlanFileId(response.id);
      setPlanFileId(response.id);
      setPlanUrl(response.url); 
      setRotatedPlanUrl(response.url); // Изначально без поворота
      setRotation(0);
      setCurrentStep('mask');
    } catch (err) {
      setError('Ошибка загрузки файла');
    } finally {
      setLoading(false);
    }
  };

  // Handle crop completion
  const handleCropComplete = async (rect: CropRect) => {
    setCropRect(rect);
    setShowCropSelector(false);
    
    // Generate visual feedback using ROTATED image
    if (rotatedPlanUrl) {
        const url = await generateCroppedImage(rotatedPlanUrl, rect);
        setCroppedPlanUrl(url);
    }
  };

  // Rotate handler
  const handleRotate = async () => {
      if (!planUrl) return;
      const newRotation = (rotation + 90) % 360;
      setRotation(newRotation);
      
      // Update visual
      const url = await generateRotatedImage(planUrl, newRotation);
      setRotatedPlanUrl(url);
      
      // Reset dependent states
      setCropRect(null);
      setCroppedPlanUrl(null);
  };

  // Сброс кадрирования
  const handleResetCrop = () => {
    setCropRect(null);
    setCroppedPlanUrl(null);
  };

  // Расчёт маски (с возможным кадрированием)
  const handleCalculateMaskWithCrop = async (crop?: CropRect) => {
    if (!planFileId) return;

    setLoading(true);
    setError(null);

    try {
      // Send crop and rotation
      const response = await reconstructionApi.calculateMask(
          planFileId, 
          crop,
          // If we have crop, it is relative to the rotated image.
          // Backend will rotate then crop.
          // Pass rotation parameter to API (need to update API service first, done)
          rotation 
      );
      setMaskFileId(response.id);
      setCurrentStep('hough');
    } catch (err) {
      setError('Ошибка расчёта маски');
    } finally {
      setLoading(false);
    }
  };

  // Расчёт маски (без кадрирования)
  const handleCalculateMask = async () => {
    handleCalculateMaskWithCrop(cropRect || undefined);
  };

  // Расчёт линий Хафа
  const handleCalculateHough = async () => {
    if (!planFileId || !maskFileId) return;

    setLoading(true);
    setError(null);

    try {
      await reconstructionApi.calculateHough(planFileId, maskFileId);
      setCurrentStep('mesh');
    } catch (err) {
      setError('Ошибка расчёта линий Хафа');
    } finally {
      setLoading(false);
    }
  };

  // Построение 3D модели
  const handleBuildMesh = async () => {
    if (!planFileId || !maskFileId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await reconstructionApi.calculateMesh(planFileId, maskFileId);
      setMeshId(response.id);
      
      // Store mesh URL for viewer
      if (response.url) {
        setMeshUrl(response.url);
      }
      
      setCurrentStep('save');
    } catch (err) {
      setError('Ошибка построения 3D модели');
    } finally {
      setLoading(false);
    }
  };

  // Сохранение реконструкции
  const handleSave = async () => {
    if (!meshId || !reconstructionName.trim()) {
      setError('Введите название реконструкции');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await reconstructionApi.saveReconstruction(meshId, reconstructionName.trim());
      navigate('/reconstructions');
    } catch (err) {
      setError('Ошибка сохранения реконструкции');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-reconstruction-page">
      <header className="page-header">
        <h1>Добавление реконструкции</h1>
      </header>

      <main className="process-steps">
        {/* Этап 1: Загрузка плана */}
        <section className={`step ${currentStep === 'upload' ? 'active' : ''}`}>
          <h2>1. План помещения</h2>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handlePlanUpload}
            disabled={loading}
          />
          {planFileId && <p className="success">✓ Файл загружен</p>}
        </section>

        {/* Этап 2: Маска */}
        <section className={`step ${currentStep === 'mask' ? 'active' : ''}`}>
          <h2>2. Маска стен</h2>
          <div className="mask-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!cropRect ? (
                <button 
                  onClick={() => setShowCropSelector(true)} 
                  disabled={!planFileId || loading}
                  style={{ background: '#3b82f6' }}
                >
                   Кадрировать
                </button>
            ) : (
                <button 
                  onClick={handleResetCrop} 
                  disabled={loading}
                  style={{ background: '#ef4444' }}
                >
                  ↩️ Сбросить кадрирование
                </button>
            )}

            <button onClick={handleRotate} disabled={loading} style={{ background: '#8b5cf6' }}>
                🔄 Повернуть (90°)
            </button>
            
            <button onClick={handleCalculateMask} disabled={!planFileId || loading}>
                ✨ {cropRect ? 'Рассчитать маску (для области)' : 'Автоматический расчёт'}
            </button>
          </div>
          {cropRect && (
            <p style={{ color: '#4ade80', fontSize: '14px' }}>
              ✓ Область выбрана
            </p>
          )}
          
          {planFileId && (
              <div style={{ marginTop: '20px' }}>
                  <MaskEditor
                      planUrl={croppedPlanUrl || rotatedPlanUrl || planUrl}
                      // В заглушке uploadApi мы возвращали локальный URL
                      // Нам нужно передавать URL, который мы подучили с бекенда.
                      // В UploadPhotoResponse есть поле url.
                      // Но AddReconstructionPage сейчас хранит только id. 
                      // Исправим состояние, чтобы хранить весь объект ответа или URL.
                      
                      // Пока предположим, что мы можем получить URL.
                      // Для MVP я добавлю получение URL в состояние
                      
                      maskUrl={maskFileId ? `/api/v1/uploads/masks/${maskFileId}.png` : undefined}
                      onSave={async (blob) => {
                          // Сохраняем отредактированную маску
                          const file = new File([blob], "edited_mask.png", { type: "image/png" });
                          setLoading(true);
                          try {
                              const response = await uploadApi.uploadUserMask(file);
                              setMaskFileId(response.id);
                              setCurrentStep('hough');
                          } catch(err) {
                              setError('Ошибка сохранения маски');
                          } finally {
                              setLoading(false);
                          }
                      }}
                  />
              </div>
          )}
        </section>

        {/* Этап 3: Линии Хафа */}
        <section className={`step ${currentStep === 'hough' ? 'active' : ''}`}>
          <h2>3. Линии Хафа</h2>
          <button onClick={handleCalculateHough} disabled={!maskFileId || loading}>
            Просчитать линии
          </button>
        </section>

        {/* Этап 4: 3D модель */}
        <section className={`step ${currentStep === 'mesh' ? 'active' : ''}`}>
          <h2>4. 3D-реконструкция</h2>
          <button onClick={handleBuildMesh} disabled={!maskFileId || loading}>
            Построить
          </button>
        </section>

        {/* Этап 5: Сохранение */}
        <section className={`step ${currentStep === 'save' ? 'active' : ''}`}>
          <h2>5. Сохранение</h2>
          {meshId && (
            <>
              {/* 3D Model Preview */}
              {meshUrl && (
                <div className="mesh-preview" style={{ marginBottom: '20px' }}>
                  <p style={{ color: '#4ade80' }}>✓ 3D модель построена</p>
                  <a 
                    href={`/mesh/${meshId}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: '#60a5fa', textDecoration: 'underline' }}
                  >
                    Открыть 3D просмотр
                  </a>
                </div>
              )}
              
              <input 
                type="text" 
                placeholder="Название реконструкции" 
                value={reconstructionName}
                onChange={(e) => setReconstructionName(e.target.value)}
                disabled={loading}
              />
              <button onClick={handleSave} disabled={loading || !reconstructionName.trim()}>
                Сохранить
              </button>
            </>
          )}
        </section>

        {/* Индикаторы */}
        {loading && <div className="loading">Загрузка...</div>}
        {error && <div className="error">{error}</div>}
      </main>
      
      {/* Crop Selector Modal */}
      {showCropSelector && (rotatedPlanUrl || planUrl) && (
        <CropSelector
          imageUrl={rotatedPlanUrl || planUrl}
          onCropComplete={handleCropComplete}
          onCancel={() => setShowCropSelector(false)}
        />
      )}
    </div>
  );
}

export default AddReconstructionPage;
