# Phase 5: Frontend — MeshViewer upgrade + RoomLabels

phase: 5
layer: frontend
depends_on: phase-04
design: ../01-architecture.md, ../05-api-contract.md

## Goal

Рефакторить `MeshViewer.tsx` в компонент с визуальным стилем 2GIS:
цветные полы, тёмные стены, правильное освещение, изометрическая камера.
Добавить `RoomLabels` overlay, `ViewerControls`, хук `useMeshViewer`.
Вынести логику из `ViewMeshPage` в хук.

## Context

Phase 4 добавила `room_labels` в API ответ `GET /reconstructions/{id}`.
Текущий `MeshViewer.tsx` — 56 строк, только OrbitControls, без стиля.
Текущий `ViewMeshPage.tsx` — логика прямо в компоненте (useEffect + useState).

## Files to Create

### `frontend/src/types/reconstruction.ts`

```typescript
export interface RoomLabel {
  id: string;
  name: string;
  room_type: 'classroom' | 'corridor' | 'staircase' | 'toilet' | 'other' | 'room';
  center_x: number;  // нормализованные [0, 1]
  center_y: number;
  color: string;     // HEX "#rrggbb"
}

export interface ReconstructionDetail {
  id: number;
  name: string | null;
  status: number;
  status_display: string;
  url: string | null;
  error_message?: string | null;
  room_labels: RoomLabel[];
}
```

### `frontend/src/hooks/useMeshViewer.ts`

```typescript
interface UseMeshViewerReturn {
  data: ReconstructionDetail | null;
  isLoading: boolean;
  error: string | null;
}

export const useMeshViewer = (id: string | undefined): UseMeshViewerReturn
```

- Вызывает `reconstructionApi.getReconstructionById(parseInt(id))`
- Возвращает типизированный `ReconstructionDetail`
- Обрабатывает loading/error состояния

### `frontend/src/components/MeshViewer/RoomLabels.tsx`

HTML overlay поверх Canvas с метками комнат.

```typescript
interface RoomLabelsProps {
  labels: RoomLabel[];
}

export const RoomLabels: React.FC<RoomLabelsProps>
```

- Рендерит `<div>` с абсолютным позиционированием поверх Canvas
- Каждая метка: цветной кружок + название комнаты
- Позиция: `left: label.center_x * 100%`, `top: label.center_y * 100%`
- Стиль: белый фон с тенью, как попап на карте
- Если `name` пуст — показывать `room_type` (локализованный)

```typescript
const ROOM_TYPE_LABELS: Record<string, string> = {
  classroom: 'Аудитория',
  corridor: 'Коридор',
  staircase: 'Лестница',
  toilet: 'Туалет',
  other: 'Помещение',
  room: 'Помещение',
};
```

### `frontend/src/components/MeshViewer/ViewerControls.tsx`

```typescript
interface ViewerControlsProps {
  glbUrl: string | null;
  onResetCamera: () => void;
  onToggleView: () => void;
  isTopView: boolean;
}

export const ViewerControls: React.FC<ViewerControlsProps>
```

- Кнопка "Сверху" / "3D" — переключает вид
- Кнопка "Скачать GLB" — `window.open(glbUrl)` если `glbUrl` не null
- Кнопка "Сбросить камеру" — вызывает `onResetCamera`
- Позиция: абсолютно в правом верхнем углу вьюера

## Files to Modify

### `frontend/src/components/MeshViewer.tsx` → `frontend/src/components/MeshViewer/MeshViewer.tsx`

Переместить файл в подпапку и полностью переписать:

**Визуальный стиль (2GIS):**
```tsx
// Фон сцены
<color attach="background" args={['#e8e8e8']} />

// Освещение
<ambientLight intensity={0.7} />
<directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />

// Камера по умолчанию — изометрия ~60°
<Canvas
  shadows
  camera={{ position: [15, 20, 15], fov: 45 }}
>
```

**Убрать:**
- `<Stage environment="city">` — заменить на явное освещение выше
- `any` тип для `scene` — использовать `THREE.Group | THREE.Object3D`

**Добавить:**
- `isTopView` prop — если true, камера переходит в ортографический режим
  (через `useThree().camera` и смену на `OrthographicCamera`)
- `onResetCamera` callback ref — для кнопки сброса

**Структура компонента:**
```tsx
interface MeshViewerProps {
  url: string;
  roomLabels?: RoomLabel[];
  glbUrl?: string | null;
}

export const MeshViewer: React.FC<MeshViewerProps>
```

- Рендерит `<Canvas>` + `<RoomLabels>` overlay + `<ViewerControls>`
- Все в `position: relative` контейнере

### `frontend/src/pages/ViewMeshPage.tsx`

Упростить: вся логика уходит в `useMeshViewer`.

```tsx
function ViewMeshPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useMeshViewer(id);

  if (isLoading) return <div className="loading-screen">Загрузка 3D модели...</div>;
  if (error || !data) return <div className="error-screen">{error || 'Модель не найдена'}</div>;

  return (
    <div className="view-mesh-page">
      <header className="mesh-header">
        <h1>{data.name || `Модель #${data.id}`}</h1>
        <span className="status">{data.status_display}</span>
      </header>
      <main className="mesh-viewer">
        {data.url ? (
          <MeshViewer
            url={data.url}
            roomLabels={data.room_labels}
            glbUrl={data.url.endsWith('.glb') ? data.url : null}
          />
        ) : (
          <div className="placeholder-3d">
            {data.status === 4
              ? <p style={{ color: '#ef4444' }}>{data.error_message || 'Ошибка построения'}</p>
              : <p>Статус: {data.status_display}</p>
            }
          </div>
        )}
      </main>
    </div>
  );
}
```

## Verification
- [ ] `tsc --noEmit` passes (нет TypeScript ошибок)
- [ ] Нет `any` типов без eslint-disable комментария
- [ ] `MeshViewer` рендерится без ошибок в браузере
- [ ] Фон сцены серый `#e8e8e8`, стены тёмные, полы цветные
- [ ] Метки комнат отображаются поверх Canvas
- [ ] Кнопка "Скачать GLB" скачивает файл
- [ ] Кнопка "Сверху" переключает вид
- [ ] Все Three.js объекты имеют `dispose()` при unmount (проверить в DevTools Memory)
