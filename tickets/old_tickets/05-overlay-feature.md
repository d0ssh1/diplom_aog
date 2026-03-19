# Тикет: Прозрачное наложение оригинала на векторную маску

## Суть

На шаге 3 (редактор стен) добавить возможность наложить оригинальную фотографию 
плана поверх векторизованной маски. Пользователь видит одновременно маску и оригинал,
что помогает дорисовывать пропущенные стены и стирать мусор.

Управление: выключатель (toggle) + слайдер прозрачности 0-100%.

---

## Проблема с размером изображения на canvas

На скриншоте видно что при отдалении маска занимает только часть canvas, 
остальное — чёрный фон. Оверлей должен точно совпадать с маской (тот же размер и позиция).

Важно: оригинал должен быть ОБРЕЗАН И ПОВЁРНУТ так же как маска 
(с учётом cropRect и rotation из шага 2).

---

## Реализация

### 1. Подготовка оверлея — повёрнутый + кадрированный оригинал

**Файл:** `frontend/src/components/Editor/WallEditorCanvas.tsx`

Добавить props:
```typescript
interface WallEditorCanvasProps {
  maskUrl: string;
  planUrl?: string;                    // URL оригинала
  planCropRect?: CropRect | null;      // кадрирование со шага 2
  planRotation?: number;               // поворот со шага 2
  overlayEnabled?: boolean;            // toggle вкл/выкл
  overlayOpacity?: number;             // 0-1
  // ...остальные существующие props
}
```

Подготовить displayPlanUrl через offscreen canvas (rotate + crop):
```typescript
const [displayPlanUrl, setDisplayPlanUrl] = useState<string | null>(null);

useEffect(() => {
  if (!planUrl) { setDisplayPlanUrl(null); return; }
  
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    // 1. Rotate
    const rot = planRotation ?? 0;
    const swap = rot === 90 || rot === 270;
    const rCanvas = document.createElement('canvas');
    rCanvas.width = swap ? img.height : img.width;
    rCanvas.height = swap ? img.width : img.height;
    const rCtx = rCanvas.getContext('2d')!;
    rCtx.translate(rCanvas.width / 2, rCanvas.height / 2);
    rCtx.rotate((rot * Math.PI) / 180);
    rCtx.drawImage(img, -img.width / 2, -img.height / 2);
    
    // 2. Crop
    if (planCropRect) {
      const cx = Math.round(planCropRect.x * rCanvas.width);
      const cy = Math.round(planCropRect.y * rCanvas.height);
      const cw = Math.round(planCropRect.width * rCanvas.width);
      const ch = Math.round(planCropRect.height * rCanvas.height);
      
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cw;
      cropCanvas.height = ch;
      cropCanvas.getContext('2d')!.drawImage(rCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
      setDisplayPlanUrl(cropCanvas.toDataURL());
    } else {
      setDisplayPlanUrl(rCanvas.toDataURL());
    }
  };
  img.src = planUrl;
}, [planUrl, planCropRect, planRotation]);
```

### 2. Наложить оверлей HTML-элементом поверх canvas

НЕ добавлять в Fabric.js — это сломает рисование и экспорт getBlob().
Использовать HTML `<img>` с `pointer-events: none`.

```tsx
return (
  <div ref={containerRef} className={styles.container}>
    <canvas ref={canvasElRef} className={styles.canvas} />
    
    {/* Оверлей оригинала — точно поверх background image маски */}
    {overlayEnabled && displayPlanUrl && overlayOpacity > 0 && (
      <img
        src={displayPlanUrl}
        alt=""
        className={styles.planOverlay}
        style={{ opacity: overlayOpacity }}
      />
    )}
  </div>
);
```

CSS — оверлей совпадает с background image маски:
```css
.container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.canvas {
  display: block;
}

.planOverlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;     /* КРИТИЧНО — клики проходят к canvas */
  z-index: 10;
  object-fit: contain;       /* совпадает с масштабированием маски */
  width: 100%;
  height: 100%;
}
```

**ВАЖНО:** Оверлей должен совпадать с background image маски. Оба используют 
object-fit: contain / пропорциональное масштабирование. Если background image 
в Fabric.js масштабирован через `Math.min(scaleX, scaleY)`, то оверлей через 
CSS `object-fit: contain` должен совпасть автоматически, т.к. оба вписывают 
изображение в тот же контейнер.

### 3. UI — toggle + слайдер в правой панели

**Файл:** `frontend/src/components/Wizard/StepWallEditor.tsx`

Добавить state:
```typescript
const [overlayEnabled, setOverlayEnabled] = useState(true);
const [overlayOpacity, setOverlayOpacity] = useState(0.4);  // 40% по умолчанию
```

Добавить секцию в правую панель (ПОД "// НАСТРОЙКА" или как отдельную секцию):
```tsx
<div className={styles.overlaySection}>
  <div className={styles.sectionTitle}>// НАЛОЖЕНИЕ</div>
  
  {/* Toggle — выключатель */}
  <label className={styles.toggleLabel}>
    <span>Показать оригинал</span>
    <button
      className={`${styles.toggle} ${overlayEnabled ? styles.toggleActive : ''}`}
      onClick={() => setOverlayEnabled(!overlayEnabled)}
      type="button"
    >
      <span className={styles.toggleKnob} />
    </button>
  </label>
  
  {/* Слайдер прозрачности — только если toggle включен */}
  {overlayEnabled && (
    <label className={styles.paramLabel}>
      <span>Прозрачность</span>
      <div className={styles.sliderRow}>
        <input
          type="range"
          min={5}
          max={95}
          step={5}
          value={Math.round(overlayOpacity * 100)}
          onChange={(e) => setOverlayOpacity(Number(e.target.value) / 100)}
        />
        <span className={styles.sliderValue}>{Math.round(overlayOpacity * 100)}%</span>
      </div>
    </label>
  )}
</div>
```

Передать в WallEditorCanvas:
```tsx
<WallEditorCanvas
  ref={canvasRef}
  maskUrl={maskUrl}
  planUrl={planUrl}
  planCropRect={cropRect}
  planRotation={rotation}
  overlayEnabled={overlayEnabled}
  overlayOpacity={overlayOpacity}
  activeTool={activeTool}
  brushSize={brushSize}
  onRoomPopupRequest={handleRoomPopupRequest}
/>
```

### 4. Стиль toggle (выключатель)

```css
.toggleLabel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #ffffff;
  font-size: 14px;
  padding: 0 20px;
  margin-bottom: 12px;
}

.toggle {
  width: 44px;
  height: 24px;
  background: #555;
  border: none;
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}

.toggleActive {
  background: #FF5722;
}

.toggleKnob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggleActive .toggleKnob {
  transform: translateX(20px);
}

.sliderRow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sliderValue {
  color: #FF5722;
  font-weight: bold;
  min-width: 40px;
  text-align: right;
}
```

### 5. Передать planUrl из WizardPage

**Файл:** `frontend/src/pages/WizardPage.tsx`

В `case 3:` добавить props:
```tsx
case 3:
  return (
    <StepWallEditor
      maskUrl={`/api/v1/uploads/masks/${state.maskFileId}.png`}
      planUrl={state.planUrl ?? undefined}       // ДОБАВИТЬ
      cropRect={state.cropRect ?? undefined}      // ДОБАВИТЬ
      rotation={state.rotation}                   // ДОБАВИТЬ
      canvasRef={canvasRef}
    />
  );
```

---

## Порядок

1. WallEditorCanvas — добавить props, подготовка displayPlanUrl, HTML overlay
2. StepWallEditor — toggle + слайдер + передача props
3. WizardPage — передать planUrl, cropRect, rotation на шаг 3
4. CSS — стили toggle и overlay

## Проверка

- [ ] Toggle включен по умолчанию — оригинал виден
- [ ] Toggle включен — оригинал появляется поверх маски
- [ ] Слайдер регулирует прозрачность 5-95%
- [ ] Оверлей ТОЧНО совпадает с маской (тот же crop и rotation)
- [ ] Рисование/стирание работает СКВОЗЬ оверлей (pointer-events: none)
- [ ] getBlob() экспортирует ТОЛЬКО маску, без оригинала
- [ ] При зуме оверлей масштабируется вместе с маской