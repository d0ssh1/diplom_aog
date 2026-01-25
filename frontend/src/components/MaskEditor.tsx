import { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';

interface MaskEditorProps {
  planUrl: string;
  maskUrl?: string; // Если уже есть маска (например, автосгенерированная)
  onSave: (blob: Blob) => void;
}

export default function MaskEditor({ planUrl, maskUrl, onSave }: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  
  const [isErasing, setIsErasing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);

  // Инициализация Canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Создаем canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: true,
      backgroundColor: null, // Transparent to see the plan underneath
    });
    
    fabricCanvasRef.current = canvas;

    // Настраиваем кисть
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = 'white'; // Стены белые
    canvas.freeDrawingBrush.width = brushSize;

    // Загружаем изображения
    const loadImage = (url: string, isMask: boolean) => {
      fabric.Image.fromURL(url, (img) => {
        if (!img) return;
        
        // Масштабируем под контейнер
        const containerWidth = containerRef.current?.clientWidth || 800;
        const scale = containerWidth / (img.width || 1);
        
        if (!isMask) {
          // План просто как подложка (визуально) 
          // НО! Нам нужно рисовать МАСКУ.
          // Поэтому план лучше показать полупрозрачным фоном CSS, а canvas будет рисовать маску.
          // Или загрузить план, но сделать его opacity 0.5 и "не рисуемым".
          // Но тогда мы сохраним план вместе с маской.
          
          // Вариант: Canvas только для маски. План лежит под Canvas.
          // Это лучше, так как fabric.toDataURL вернет только нарисованное.
        } else {
          // Если это маска, добавляем её на canvas
          img.scale(scale);
          canvas.add(img);
          canvas.renderAll();
        }
        
        // Устанавливаем размер canvas под размер изображения
        canvas.setWidth(img.width! * scale);
        canvas.setHeight(img.height! * scale);
      }, { crossOrigin: 'anonymous' });
    };

    // Если передан url маски - загружаем её
    if (maskUrl) {
      loadImage(maskUrl, true);
    }

    return () => {
      canvas.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maskUrl]); // Пересоздаем если меняется URL

  // Обновление параметров кисти
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.freeDrawingBrush.color = isErasing ? 'black' : 'white';
    canvas.freeDrawingBrush.width = brushSize;
  }, [isErasing, brushSize]);

  const handleSave = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    
    // Экспорт в Blob
    // Преобразуем canvas в DataURL -> Blob
    const dataURL = canvas.toDataURL({
      format: 'png',
      multiplier: 1, // Оригинальное разрешение? Сложно, если мы масштабировали.
      // Лучше сохранять как есть, а на сервере уже ресайзить если надо.
    });

    fetch(dataURL)
      .then(res => res.blob())
      .then(blob => onSave(blob));
  };

  const clearCanvas = () => {
    const canvas = fabricCanvasRef.current;
    if (canvas) {
        canvas.clear();
        canvas.setBackgroundColor('black', () => canvas.renderAll());
    }
  };

  return (
    <div className="mask-editor-container" style={{ display: 'flex', gap: '20px' }}>
        <div 
            ref={containerRef} 
            style={{ 
                position: 'relative', 
                border: '1px solid #ccc',
                minWidth: '600px',
                minHeight: '400px'
            }}
        >
            {/* План как подложка */}
            {planUrl && (
                <img 
                    src={planUrl} 
                    alt="Plan Background" 
                    style={{ 
                        position: 'absolute', 
                        top: 0, 
                        left: 0, 
                        width: '100%', 
                        height: 'auto',
                        opacity: 0.5,
                        pointerEvents: 'none',
                        zIndex: 0
                    }} 
                />
            )}
            
            {/* Canvas для рисования маски поверх */}
            <canvas ref={canvasRef} style={{ zIndex: 1 }} />
        </div>

        <div className="tools-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3>Инструменты</h3>
            
            <div>
                <button 
                    onClick={() => setIsErasing(false)}
                    className={!isErasing ? 'active' : ''}
                    style={{ background: !isErasing ? 'green' : ''}}
                >
                    ✏️ Рисовать (Стена)
                </button>
                <button 
                    onClick={() => setIsErasing(true)}
                    className={isErasing ? 'active' : ''}
                    style={{ background: isErasing ? 'red' : ''}}
                >
                    🧹 Стереть
                </button>
            </div>

            <div>
                <label>Размер кисти: {brushSize}px</label>
                <input 
                    type="range" 
                    min="5" 
                    max="50" 
                    value={brushSize} 
                    onChange={(e) => setBrushSize(Number(e.target.value))} 
                />
            </div>

            <button onClick={clearCanvas}>Очистить всё</button>
            
            <div style={{ marginTop: 'auto' }}>
                <button onClick={handleSave} className="btn-primary">
                    💾 Сохранить и продолжить
                </button>
            </div>
        </div>
    </div>
  );
}
