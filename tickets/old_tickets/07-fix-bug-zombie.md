# Тикет 15: Зависающие временные объекты + правки маски не попадают в 3D-модель

**Приоритет:** Высокий (блокирует работу ластика + 3D-построение бессмысленно без фикса)  
**Предыдущий тикет:** 14 (выполнен)  
**Скриншоты-референсы:** 3 изображения в чате

**Затрагиваемые файлы:**
- `frontend/src/components/Editor/WallEditorCanvas.tsx`
- `frontend/src/hooks/useWizard.ts`
- `frontend/src/pages/WizardPage.tsx`

---

## Общая корневая причина

В `attachToolHandlers()` секция Reset (строки 165–169) снимает обработчики и отключает `isDrawingMode`, но **не удаляет временные Fabric.js-объекты**, которые были созданы предыдущим инструментом и остались на канвасе в незавершённом состоянии.

Текущий Reset:
```typescript
// Reset
canvas.isDrawingMode = false;
canvas.off('mouse:down');
canvas.off('mouse:move');
canvas.off('mouse:up');
```

Временные объекты, которые могут «зависнуть»:
- `selRect` — пунктирный прямоугольник выделения области ластика
- Кнопки подтверждения/отмены (Fabric-объекты или HTML state `eraseSelection`)
- `previewLine` — оранжевая пунктирная линия-превью при рисовании стены (первый клик сделан, второй — нет)

---

## Баг 1: Выделение области ластика «застревает» на канвасе

**Воспроизведение:**
1. Выбрать «Стереть» → «Выделить область»
2. Начать выделение (drag-rectangle появляется)
3. Переключить инструмент (например, на «Кисть» или «Нарисовать стену») до подтверждения/отмены
4. Пунктирный прямоугольник остаётся на канвасе навсегда
5. Он ведёт себя как объект маски — его можно «стереть» кистью (скриншот 1, 2)
6. Повторное использование «Выделить область» не работает

**Причина:**  
`selRect` (`fabric.Rect` с `strokeDashArray`) создаётся в `onMouseDown` select-erase режима. При переключении инструмента `attachToolHandlers()` снимает обработчики, но `selRect` остаётся на canvas. Также если кнопки ✓/✕ реализованы через React state (`eraseSelection`), state не сбрасывается.

---

## Баг 2: Preview-линия стены «застревает» на канвасе

**Воспроизведение:**
1. Выбрать «Нарисовать стену»
2. Сделать первый клик (появляется оранжевая пунктирная preview-линия)
3. Переключить инструмент до второго клика
4. Preview-линия остаётся на канвасе навсегда (скриншот 3)
5. Она ведёт себя как объект — можно стереть кистью

**Причина:**  
`previewLine` (`fabric.Line` с `strokeDashArray: [5, 5]`) создаётся при первом клике (строки 303–313). При переключении инструмента handlers снимаются, но `previewLine` остаётся на canvas. Переменная `startPoint` тоже не сбрасывается (хотя она локальная в замыкании, проблема именно в fabric-объекте).

---

## Решение

Сохранять ссылки на все временные объекты в `useRef` и **чистить их в секции Reset** при каждом переключении инструмента.

### Шаг 1: Создать ref'ы для временных объектов

```typescript
// После существующих ref'ов (строки ~48–52):
const tempObjectsRef = useRef<fabric.Object[]>([]);
```

### Шаг 2: Расширить секцию Reset в `attachToolHandlers()`

```typescript
const attachToolHandlers = useCallback(() => {
  const canvas = fabricRef.current;
  if (!canvas) return;

  // Reset — НОВОЕ: удаляем все временные объекты с канваса
  tempObjectsRef.current.forEach((obj) => {
    canvas.remove(obj);
  });
  tempObjectsRef.current = [];

  // Reset — сбрасываем React state для HTML-кнопок ластика (если есть)
  // setEraseSelection(null);  // ← раскомментировать если кнопки через React state

  canvas.isDrawingMode = false;
  canvas.off('mouse:down');
  canvas.off('mouse:move');
  canvas.off('mouse:up');
  canvas.off('path:created');
  canvas.renderAll();

  // ... дальше логика инструментов ...
```

### Шаг 3: Регистрировать временные объекты при создании

**В select-erase (onMouseDown), при создании selRect:**
```typescript
selRect = new fabric.Rect({
  left: startX, top: startY, width: 0, height: 0,
  fill: 'rgba(255,0,0,0.2)',
  stroke: '#FF5722', strokeWidth: 1, strokeDashArray: [4, 4],
  selectable: false, evented: false,
});
canvas.add(selRect);
tempObjectsRef.current.push(selRect); // ← РЕГИСТРИРУЕМ
```

**В select-erase (onMouseUp), при создании кнопок (если остались Fabric-объекты):**
```typescript
// Если кнопки ✓/✕ — Fabric-объекты:
canvas.add(confirmBtn, cancelBtn);
tempObjectsRef.current.push(confirmBtn, cancelBtn); // ← РЕГИСТРИРУЕМ
```

**В wall/door tool (onMouseDown), при создании previewLine:**
```typescript
previewLine = new fabric.Line(
  [pointer.x, pointer.y, pointer.x, pointer.y],
  {
    stroke: '#FF4500', strokeWidth: 2,
    strokeDashArray: [5, 5],
    selectable: false, evented: false,
  },
);
canvas.add(previewLine);
tempObjectsRef.current.push(previewLine); // ← РЕГИСТРИРУЕМ
```

### Шаг 4: Удалять из ref при нормальном завершении

Когда объект удаляется штатно (второй клик стены, подтверждение/отмена ластика) — убирать его из `tempObjectsRef`:

```typescript
// Утилита:
const removeTempObject = (obj: fabric.Object) => {
  tempObjectsRef.current = tempObjectsRef.current.filter((o) => o !== obj);
};

// При удалении previewLine (второй клик стены):
if (previewLine) {
  canvas.remove(previewLine);
  removeTempObject(previewLine);
  previewLine = null;
}

// При подтверждении/отмене ластика:
canvas.remove(capturedSel);
removeTempObject(capturedSel);
// и т.д. для кнопок
```

### Шаг 5: Если кнопки ✓/✕ — HTML через React state

Если в тикете 13 кнопки переделаны на HTML (через `eraseSelection` state), нужно дополнительно сбрасывать state в Reset. Но `setEraseSelection` нельзя вызвать внутри `useCallback` напрямую (нет в зависимостях). Варианты:

**Вариант A (предпочтительный): через ref:**
```typescript
const eraseSelectionRef = useRef(eraseSelection);
useEffect(() => { eraseSelectionRef.current = eraseSelection; }, [eraseSelection]);

// В Reset:
if (eraseSelectionRef.current) {
  canvas.remove(eraseSelectionRef.current.fabricRect);
  setEraseSelection(null);
}
```

**Вариант B: вызвать reset вне attachToolHandlers:**
```typescript
// В useEffect который вызывает attachToolHandlers:
useEffect(() => {
  // Сбрасываем HTML-кнопки ластика при смене инструмента
  setEraseSelection(null);
  attachToolHandlers();
}, [activeTool, brushSize, eraserMode, attachToolHandlers]);
```

Вариант B проще и надёжнее — рекомендую его.

---

## Баг 3: КРИТИЧНО — Рисование стен и стирание не сохраняются в 3D-модели

**Затрагиваемые файлы (дополнительно к основному):**
- `frontend/src/hooks/useWizard.ts`
- `frontend/src/pages/WizardPage.tsx`

**Проблема:**  
Любые правки на шаге 3 (нарисованные стены, стёртые области) полностью игнорируются при построении 3D-модели. Модель строится по оригинальной неизменённой маске. Также при возврате с шага 4 (3D-просмотр) на шаг 3 (редактор) — все пользовательские правки теряются, канвас загружает оригинальную маску.

**Ожидаемое поведение:**
1. Пользователь рисует стены / стирает → нажимает `> ПОСТРОИТЬ`
2. 3D-модель строится из **отредактированной** маски
3. Пользователь видит 3D → замечает проблему → нажимает «Назад»
4. Возвращается на шаг 3 с **сохранёнными правками**
5. Редактирует → снова `> ПОСТРОИТЬ` → 3D-модель обновлена

### Корневая причина — 3 проблемы:

#### Проблема 3a: `buildMesh()` использует оригинальную маску, а не отредактированную

В `useWizard.ts` (строки 106–122):

```typescript
const buildMesh = useCallback(async () => {
  if (!state.planFileId || !state.maskFileId) return;  // ← maskFileId = ОРИГИНАЛ
  // ...
  const data = await reconstructionApi.calculateMesh(
    state.planFileId,
    state.maskFileId  // ← ОРИГИНАЛ! Должен быть editedMaskFileId
  );
  // ...
}, [state.planFileId, state.maskFileId]);  // ← зависимость от maskFileId
```

А `saveMaskAndAnnotations()` (строки 76–85) сохраняет отредактированную маску в `editedMaskFileId`:

```typescript
setState((s) => ({
  ...s,
  editedMaskFileId: String(data.id ?? data.file_id ?? ''),  // ← СЮДА
  // ...
}));
```

**Итого:** отредактированная маска загружается на сервер и `editedMaskFileId` записывается — но `buildMesh` его никогда не читает.

#### Проблема 3b: `saveMaskAndAnnotations` и `buildMesh` вызываются последовательно, но state не успевает обновиться

В `WizardPage.tsx` (строки 29–33):
```typescript
} else if (state.step === 3 && canvasRef.current) {
  const blob = await canvasRef.current.getBlob();
  const { rooms, doors } = canvasRef.current.getAnnotations();
  await wizard.saveMaskAndAnnotations(blob, rooms, doors);  // setState внутри
  await wizard.buildMesh();  // читает state.maskFileId, НЕ editedMaskFileId
}
```

Даже если поправить `buildMesh` на `editedMaskFileId` — `setState` асинхронный, и `buildMesh` вызывается сразу после `saveMaskAndAnnotations`. К моменту вызова `buildMesh` state ещё может не обновиться, и `editedMaskFileId` будет `null`.

#### Проблема 3c: При возврате с шага 4 на шаг 3 канвас загружает оригинальную маску

В `WizardPage.tsx` (строка 82):
```tsx
<StepWallEditor
  maskUrl={`/api/v1/uploads/masks/${state.maskFileId}.png`}  // ← ОРИГИНАЛ
  // ...
/>
```

При возврате `prevStep()` с шага 4 → шаг 3, `WallEditorCanvas` перемонтируется с оригинальной `maskUrl`, и все правки теряются.

### Решение:

#### Фикс 3a+3b: `buildMesh` принимает maskFileId как аргумент

Изменить `buildMesh` чтобы он принимал `maskId` явно, а не читал из state:

```typescript
// useWizard.ts
const buildMesh = useCallback(async (editedMaskId?: string) => {
  const maskId = editedMaskId || state.editedMaskFileId || state.maskFileId;
  if (!state.planFileId || !maskId) return;
  setState((s) => ({ ...s, isLoading: true, error: null }));
  try {
    const data = await reconstructionApi.calculateMesh(state.planFileId, maskId);
    const detail = await reconstructionApi.getReconstructionById(data.id as number);
    setState((s) => ({
      ...s,
      reconstructionId: data.id as number,
      meshUrl: detail.url as string | null,
      isLoading: false,
      step: 4,
    }));
  } catch {
    setState((s) => ({ ...s, isLoading: false, error: 'Ошибка построения 3D-модели' }));
  }
}, [state.planFileId, state.editedMaskFileId, state.maskFileId]);
```

И изменить `saveMaskAndAnnotations` чтобы **возвращал** id загруженной маски:

```typescript
const saveMaskAndAnnotations = useCallback(async (
  blob: Blob, rooms: RoomAnnotation[], doors: DoorAnnotation[]
): Promise<string | null> => {
  setState((s) => ({ ...s, isLoading: true, error: null }));
  try {
    const file = new File([blob], 'mask.png', { type: 'image/png' });
    const data = await uploadApi.uploadUserMask(file);
    const editedId = String(data.id ?? data.file_id ?? '');
    setState((s) => ({
      ...s,
      editedMaskFileId: editedId,
      rooms,
      doors,
      isLoading: false,
    }));
    return editedId;  // ← Возвращаем ID
  } catch {
    setState((s) => ({ ...s, isLoading: false, error: 'Ошибка сохранения маски' }));
    return null;
  }
}, []);
```

В `WizardPage.tsx`:
```typescript
} else if (state.step === 3 && canvasRef.current) {
  const blob = await canvasRef.current.getBlob();
  const { rooms, doors } = canvasRef.current.getAnnotations();
  const editedMaskId = await wizard.saveMaskAndAnnotations(blob, rooms, doors);
  if (editedMaskId) {
    await wizard.buildMesh(editedMaskId);  // ← Передаём ID напрямую
  }
}
```

#### Фикс 3c: При возврате на шаг 3 — загружать отредактированную маску

В `WizardPage.tsx`, в `renderStep()` для case 3:

```tsx
case 3:
  return (
    <StepWallEditor
      maskUrl={
        state.editedMaskFileId
          ? `/api/v1/uploads/masks/${state.editedMaskFileId}.png`  // Отредактированная
          : `/api/v1/uploads/masks/${state.maskFileId}.png`        // Оригинальная
      }
      // ... остальные props
    />
  );
```

Таким образом, при возврате с шага 4 на шаг 3, канвас загрузит последнюю отредактированную маску. Пользователь увидит свои предыдущие правки (нарисованные стены, стёртые области) и сможет продолжить редактирование.

**Ограничение:** отдельные Fabric.js-объекты (нарисованные линии, аннотации) при этом потеряются — канвас перезагрузится с «запечёнными» в маску правками. Это приемлемо для MVP. Для полного сохранения состояния нужен был бы сериализация Fabric.js canvas — это out of scope.

#### Фикс 3d: Обновить типизацию UseWizardReturn

```typescript
interface UseWizardReturn {
  // ...
  saveMaskAndAnnotations: (blob: Blob, rooms: RoomAnnotation[], doors: DoorAnnotation[]) => Promise<string | null>;
  buildMesh: (editedMaskId?: string) => Promise<void>;
  // ...
}
```

---

## Порядок реализации

1. **Баг 3a+3b** — `buildMesh` принимает maskId как аргумент + `saveMaskAndAnnotations` возвращает ID (КРИТИЧНО — без этого 3D бесполезно)
2. **Баг 3c** — maskUrl при возврате на шаг 3 использует `editedMaskFileId`
3. **Баг 3d** — Обновить типы `UseWizardReturn`
4. **Баги 1–2** — `tempObjectsRef` для очистки временных объектов при смене инструмента

---

## Чеклист после реализации

**Баги 1–2 (временные объекты):**
- [ ] Начать выделение области → переключить инструмент → пунктирный прямоугольник исчез
- [ ] Начать рисовать стену (1 клик) → переключить инструмент → preview-линия исчезла
- [ ] После очистки — все инструменты работают нормально (нет «замороженного» состояния)
- [ ] Ластик «Выделить область» работает многократно подряд
- [ ] Штатное использование не сломано: второй клик стены создаёт стену, ✓/✕ работают

**Баг 3 (сохранение правок и 3D):**
- [ ] Нарисовать стену → ПОСТРОИТЬ → 3D-модель содержит нарисованную стену
- [ ] Стереть область → ПОСТРОИТЬ → 3D-модель НЕ содержит стёртую область
- [ ] ПОСТРОИТЬ → увидеть 3D → Назад → канвас показывает отредактированную маску (не оригинал)
- [ ] Повторно отредактировать → ПОСТРОИТЬ → новая 3D-модель с учётом всех правок
- [ ] `npx tsc --noEmit` — без ошибок