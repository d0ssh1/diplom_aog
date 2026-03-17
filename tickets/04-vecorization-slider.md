# Тикет: Ползунки настройки векторизации с live-превью

## Суть

На шаге 2 (препроцессинг) добавить два ползунка в правую панель:
- **Чувствительность** (blockSize) — насколько детально выделяются стены
- **Контраст** (C) — порог отсечения: что считать стеной, а что фоном

При изменении ползунков — мгновенное превью маски прямо на canvas.
Пользователь подбирает лучшие параметры для конкретного плана.

---

## Backend: Preview endpoint

### Новый endpoint

**Файл:** `backend/app/api/reconstruction.py`

```python
@router.post("/mask-preview")
async def mask_preview(
    request: MaskPreviewRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: MaskService = Depends(get_mask_service),
):
    """Генерирует превью маски с заданными параметрами. Не сохраняет на диск."""
    try:
        mask_bytes = await svc.preview_mask(
            file_id=request.file_id,
            crop=request.crop,
            rotation=request.rotation,
            block_size=request.block_size,
            threshold_c=request.threshold_c,
        )
    except Exception as e:
        logger.error("mask_preview failed: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка генерации превью")
    
    from fastapi.responses import Response
    return Response(content=mask_bytes, media_type="image/png")
```

### Pydantic модель запроса

**Файл:** `backend/app/models/__init__.py` (или отдельный файл)

```python
class MaskPreviewRequest(BaseModel):
    file_id: str
    crop: Optional[CropData] = None
    rotation: int = 0
    block_size: int = 15       # 11-51, нечётное
    threshold_c: int = 10      # 2-20
```

### Метод preview в MaskService

**Файл:** `backend/app/services/mask_service.py`

```python
async def preview_mask(
    self,
    file_id: str,
    crop: dict | None = None,
    rotation: int = 0,
    block_size: int = 15,
    threshold_c: int = 10,
) -> bytes:
    """Генерирует превью маски БЕЗ сохранения на диск. Возвращает PNG bytes."""
    plan_path = self._find_file(file_id, "plans")
    img = cv2.imread(plan_path)
    if img is None:
        raise ImageProcessingError("preview_mask", f"Failed to load: {plan_path}")

    # Rotate
    if rotation:
        r = rotation % 360
        if r == 90:
            img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
        elif r == 180:
            img = cv2.rotate(img, cv2.ROTATE_180)
        elif r == 270:
            img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

    # Color removal
    img = remove_colored_elements(img)

    # Crop
    if crop is not None:
        h, w = img.shape[:2]
        x = max(0, int(crop["x"] * w))
        y = max(0, int(crop["y"] * h))
        cw = max(1, int(crop["width"] * w))
        ch = max(1, int(crop["height"] * h))
        img = img[y:y+ch, x:x+cw]

    # Binarize с ПЕРЕДАННЫМИ параметрами
    gray = self._binarization.to_grayscale(img)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    
    # Гарантировать нечётный blockSize >= 3
    bs = max(3, block_size)
    if bs % 2 == 0:
        bs += 1
    
    binary = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=bs,
        C=threshold_c,
    )
    
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

    # Encode to PNG bytes (НЕ сохраняем на диск)
    _, buffer = cv2.imencode('.png', mask)
    return buffer.tobytes()
```

### Обновить calculate_mask — принимать параметры

**Файл:** `backend/app/services/mask_service.py`, метод `calculate_mask`

Добавить параметры `block_size` и `threshold_c`:
```python
async def calculate_mask(
    self,
    file_id: str,
    crop: dict | None = None,
    rotation: int = 0,
    block_size: int = 15,      # ДОБАВИТЬ
    threshold_c: int = 10,     # ДОБАВИТЬ
    ...
) -> str:
```

И использовать их в adaptive threshold вместо захардкоженных значений.

---

## Frontend: Ползунки на шаге 2

### API-клиент

**Файл:** `frontend/src/api/apiService.ts`

Добавить метод:
```typescript
previewMask: async (
  fileId: string,
  crop?: CropRect,
  rotation?: number,
  blockSize?: number,
  thresholdC?: number,
): Promise<string> => {
  const response = await apiClient.post(
    '/reconstruction/mask-preview',
    {
      file_id: fileId,
      crop: crop ?? null,
      rotation: rotation ?? 0,
      block_size: blockSize ?? 15,
      threshold_c: thresholdC ?? 10,
    },
    { responseType: 'blob' },
  );
  return URL.createObjectURL(response.data);
},
```

### StepPreprocess — добавить ползунки и превью

**Файл:** `frontend/src/components/Wizard/StepPreprocess.tsx`

Добавить state:
```typescript
const [blockSize, setBlockSize] = useState(15);
const [thresholdC, setThresholdC] = useState(10);
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
const [isPreviewLoading, setIsPreviewLoading] = useState(false);
```

Добавить debounced preview запрос:
```typescript
// Запрашивать превью при изменении ползунков (с задержкой 500ms)
useEffect(() => {
  if (!planFileId) return;
  
  const timer = setTimeout(async () => {
    setIsPreviewLoading(true);
    try {
      const url = await reconstructionApi.previewMask(
        planFileId, cropRect, rotation, blockSize, thresholdC,
      );
      // Освободить предыдущий URL
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Preview failed:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  }, 500);  // debounce 500ms
  
  return () => clearTimeout(timer);
}, [blockSize, thresholdC, planFileId, cropRect, rotation]);
```

В правой панели ToolPanelV2, добавить секцию ПОСЛЕ "// ПРЕПРОЦЕССИНГ":
```tsx
{/* Секция настройки векторизации */}
<div className={styles.paramSection}>
  <div className={styles.sectionTitle}>// НАСТРОЙКА</div>
  
  <label className={styles.paramLabel}>
    Чувствительность
    <input
      type="range"
      min={7} max={51} step={2}
      value={blockSize}
      onChange={(e) => setBlockSize(Number(e.target.value))}
    />
    <span>{blockSize}</span>
  </label>
  
  <label className={styles.paramLabel}>
    Контраст
    <input
      type="range"
      min={2} max={20} step={1}
      value={thresholdC}
      onChange={(e) => setThresholdC(Number(e.target.value))}
    />
    <span>{thresholdC}</span>
  </label>
  
  {isPreviewLoading && <div className={styles.previewSpinner}>Обновление...</div>}
</div>
```

Показать превью маски вместо/поверх оригинала когда `previewUrl` доступен:
```tsx
<div className={styles.imageWrapper}>
  {/* Оригинал всегда снизу */}
  <img ref={imageRef} src={displayUrl} alt="План" className={styles.planImage} />
  
  {/* Превью маски поверх оригинала с полупрозрачностью */}
  {previewUrl && (
    <img
      src={previewUrl}
      alt="Превью маски"
      className={styles.maskPreview}
      style={{ opacity: 0.7 }}
    />
  )}
  
  {activeTool === 'crop' && (
    <CropOverlay imageRef={imageRef} cropRect={effectiveCrop} onChange={onCropChange} />
  )}
</div>
```

CSS для превью:
```css
.maskPreview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  mix-blend-mode: multiply;  /* маска видна поверх оригинала */
}
```

### Передать параметры в useWizard

**Файл:** `frontend/src/hooks/useWizard.ts`

Добавить в `WizardState`:
```typescript
blockSize: number;     // default 15
thresholdC: number;    // default 10
```

Добавить в `UseWizardReturn`:
```typescript
setBlockSize: (v: number) => void;
setThresholdC: (v: number) => void;
```

Передать в `calculateMask`:
```typescript
const data = await reconstructionApi.calculateMask(
  state.planFileId,
  state.cropRect ?? undefined,
  state.rotation,
  state.blockSize,     // ДОБАВИТЬ
  state.thresholdC,    // ДОБАВИТЬ
);
```

### Обновить apiService.ts — calculateMask

```typescript
calculateMask: async (fileId: string, crop?: CropRect, rotation?: number, 
                       blockSize?: number, thresholdC?: number) => {
  const { data } = await apiClient.post('/reconstruction/initial-masks', {
    file_id: fileId,
    crop: crop ?? null,
    rotation: rotation ?? 0,
    block_size: blockSize ?? 15,
    threshold_c: thresholdC ?? 10,
  });
  return data;
},
```

---

## UX

- По умолчанию: blockSize=15, C=10 (текущие значения — знакомый результат)
- Ползунки показывают числовые значения справа
- При изменении — debounce 500ms → запрос на backend → превью маски
- Превью накладывается поверх оригинала (mix-blend-mode: multiply)
- Спиннер "Обновление..." при загрузке
- При нажатии "Далее" — финальная маска генерируется с выбранными параметрами

## Стиль ползунков

```css
.paramSection {
  padding: 16px 20px;
}
.paramLabel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #ffffff;
  font-size: 13px;
  margin-bottom: 16px;
}
.paramLabel input[type="range"] {
  width: 100%;
  accent-color: #FF5722;
}
.paramLabel span {
  color: #FF5722;
  font-weight: bold;
  font-size: 14px;
}
```

---

## Порядок

1. Backend: `preview_mask` метод в MaskService
2. Backend: `/mask-preview` endpoint
3. Backend: обновить `calculate_mask` — принимать block_size, threshold_c
4. Frontend: `previewMask` в apiService
5. Frontend: ползунки в StepPreprocess
6. Frontend: blockSize/thresholdC в useWizard + передача в calculateMask
7. Тест: загрузить план, двигать ползунки, проверить что превью обновляется