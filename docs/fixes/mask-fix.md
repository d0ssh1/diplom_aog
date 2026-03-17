Нашёл обе проблемы. Смотри на скриншот Network:

**Запрос `GET /api/v1/uploads/undefined` → 404.** Это значит `state.maskFileId` = `undefined`.

Причина в `WizardPage.tsx`, строка 88:
```tsx
maskUrl={`/api/v1/uploads/${state.maskFileId}`}
```

`maskFileId` не устанавливается после `calculateMask`. Смотрим `useWizard.ts` строка 80:
```typescript
const data = await reconstructionApi.calculateMask(...);
setState((s) => ({ ...s, maskFileId: data.file_id, isLoading: false }));
```

Проблема: `data.file_id` может быть `undefined`. В Network видно что `initial-masks` возвращает ответ — нужно проверить какое именно поле возвращает API. Скорее всего ответ имеет другую структуру.

Также URL маски неправильный. Маски хранятся в `uploads/masks/`, а не `uploads/`. Правильный URL должен быть `/api/v1/uploads/masks/{maskFileId}.png`.

**Два исправления:**

**1. В `useWizard.ts`, строка ~80 — добавить логирование и проверить структуру ответа:**
```typescript
const calculateMask = useCallback(async () => {
    if (!state.planFileId) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await reconstructionApi.calculateMask(
        state.planFileId,
        state.cropRect ?? undefined,
        state.rotation,
      );
      console.log('calculateMask response:', data);  // ВРЕМЕННО — посмотри что возвращает
      const fileId = data.file_id ?? data.id ?? data.mask_file_id ?? '';
      setState((s) => ({ ...s, maskFileId: String(fileId), isLoading: false }));
    } catch (err) {
      console.error('calculateMask error:', err);
      setState((s) => ({ ...s, isLoading: false, error: 'Ошибка вычисления маски' }));
    }
  }, [state.planFileId, state.cropRect, state.rotation]);
```

**2. В `WizardPage.tsx`, строка 88 — исправить URL маски:**
```tsx
case 3:
  return (
    <StepWallEditor
      maskUrl={`/api/v1/uploads/masks/${state.maskFileId}.png`}
      canvasRef={canvasRef}
    />
  );
```

Сделай первое исправление (console.log) и посмотри в DevTools Console что возвращает `calculateMask response:` — скинь мне это значение, и я скажу точно какое поле использовать.

**По кадрированию** — код CropOverlay выглядит корректно. "Слетает" скорее всего потому что при перерендере `getImageBounds()` возвращает `null` (изображение ещё не загружено). Но это менее приоритетно — сначала починим маску.