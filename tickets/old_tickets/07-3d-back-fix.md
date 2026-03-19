# Тикет 16: Превью маски перезатирает пользовательские правки при возврате с 3D

**Приоритет:** Высокий (сводит на нет весь flow редактирования)  
**Предыдущий тикет:** 15 (выполнен)

**Затрагиваемый файл:**
- `frontend/src/components/Wizard/StepWallEditor.tsx`

---

## Проблема

После фикса тикета 15 правки корректно попадают в 3D-модель. Но при возврате с шага 4 (3D-просмотр) на шаг 3 (редактор) — `useEffect` превью маски **срабатывает при монтировании** компонента и перезаписывает `currentMaskUrl` свежей неотредактированной маской с сервера. Все нарисованные стены и стёрки пропадают.

**Воспроизведение:**
1. Шаг 3 → нарисовать стены, стереть области
2. `> ПОСТРОИТЬ` → шаг 4 (3D)
3. «Назад» → шаг 3
4. Канвас загружает отредактированную маску (фикс 15/3c работает)
5. Через 500мс `useEffect` стреляет `previewMask()` → `setCurrentMaskUrl(url)` → канвас перемонтируется с чистой маской
6. Все правки потеряны

---

## Корневая причина

`StepWallEditor.tsx`, строки 63–81:

```typescript
useEffect(() => {
  if (!planFileId) return;
  const timer = setTimeout(async () => {
    setIsPreviewLoading(true);
    try {
      const url = await reconstructionApi.previewMask(
        planFileId, cropRect, rotation, blockSize, thresholdC,
      );
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setCurrentMaskUrl(url);      // ← Перезаписывает маску!
    } catch (err) {
      console.error('Preview failed:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  }, 500);
  return () => clearTimeout(timer);
}, [blockSize, thresholdC, planFileId, cropRect, rotation]);
```

Зависимости включают `planFileId`, `cropRect`, `rotation` — они не меняются при возврате, но сам `useEffect` срабатывает при **монтировании** компонента (React вызывает все effects при mount). Это значит:
- Первый визит шага 3 → effect стреляет → OK (маска нужна)
- Возврат с шага 4 → компонент перемонтируется → effect стреляет → **БАГ** (маска уже отредактирована, нельзя перезатирать)

---

## Решение

Превью маски должно обновляться **ТОЛЬКО** при изменении `blockSize` или `thresholdC` пользователем, а **НЕ** при монтировании компонента.

### Вариант (рекомендуемый): Пропустить первый вызов + реагировать только на слайдеры

```typescript
const isFirstRenderRef = useRef(true);
const prevBlockSizeRef = useRef(blockSize);
const prevThresholdCRef = useRef(thresholdC);

useEffect(() => {
  // Пропускаем первый рендер (монтирование) — маска уже передана через maskUrl prop
  if (isFirstRenderRef.current) {
    isFirstRenderRef.current = false;
    return;
  }

  // Проверяем, что изменились именно параметры маски, а не просто ремаунт
  if (
    prevBlockSizeRef.current === blockSize &&
    prevThresholdCRef.current === thresholdC
  ) {
    return; // Ничего не изменилось — не обновляем
  }

  prevBlockSizeRef.current = blockSize;
  prevThresholdCRef.current = thresholdC;

  if (!planFileId) return;

  const timer = setTimeout(async () => {
    setIsPreviewLoading(true);
    try {
      const url = await reconstructionApi.previewMask(
        planFileId, cropRect, rotation, blockSize, thresholdC,
      );
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setCurrentMaskUrl(url);
    } catch (err) {
      console.error('Preview failed:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  }, 500);

  return () => clearTimeout(timer);
}, [blockSize, thresholdC, planFileId, cropRect, rotation]);
```

**Логика:**
- При монтировании: `isFirstRenderRef.current === true` → пропускаем → канвас использует `maskUrl` prop (оригинальная или отредактированная маска из тикета 15)
- При изменении ползунка Чувствительность/Контраст: `prevBlockSizeRef` или `prevThresholdCRef` не совпадают → запрашиваем новую маску
- При ремаунте без изменения параметров (возврат с шага 4): значения совпадают → пропускаем

**Важный нюанс:** когда пользователь меняет ползунки после возврата — это осознанное действие, новая маска с сервера ожидаема. Предыдущие Fabric.js-правки при этом потеряются (маска перегенерируется с нуля), но это корректное поведение — пользователь сам решил изменить параметры.

---

## Чеклист после реализации

- [ ] Шаг 3 → нарисовать стены → ПОСТРОИТЬ → Назад → правки на месте (маска НЕ перезагрузилась)
- [ ] Шаг 3 → стереть области → ПОСТРОИТЬ → Назад → стёртые области сохранены
- [ ] Шаг 3 → вернуться с 3D → подвигать ползунок Чувствительность → маска обновилась (ОК — пользователь сам захотел)
- [ ] Шаг 3 → вернуться с 3D → подвигать ползунок Контраст → маска обновилась (ОК)
- [ ] Первый визит шага 3 (с шага 2) → маска загружается корректно через `maskUrl` prop
- [ ] `npx tsc --noEmit` — без ошибок