# Frontend Style: Diplom3D (React + TypeScript + Three.js)

## Правила TypeScript

- `strict: true` в tsconfig — обязательно
- `any` запрещён, используй `unknown` + type guard
- Все props компонентов явно типизированы через interface
- Все API ответы типизированы (копии Pydantic схем)

---

## Структура компонента

```tsx
// components/VectorEditor/VectorEditor.tsx

interface VectorEditorProps {
  floorPlanId: string;
  onSave: (walls: Wall[]) => void;
  readonly?: boolean;
}

export const VectorEditor: React.FC<VectorEditorProps> = ({
  floorPlanId,
  onSave,
  readonly = false,
}) => {
  const { walls, updateWall, isLoading } = useVectorEditor(floorPlanId);

  if (isLoading) return <Spinner />;

  return (
    <canvas
      // ...
    />
  );
};
```

---

## Структура хука

```tsx
// hooks/useVectorEditor.ts

interface UseVectorEditorReturn {
  walls: Wall[];
  selectedWall: Wall | null;
  isLoading: boolean;
  error: string | null;
  updateWall: (id: string, points: Point2D[]) => void;
  saveWalls: () => Promise<void>;
}

export const useVectorEditor = (floorPlanId: string): UseVectorEditorReturn => {
  // Вся логика здесь, компонент — только рендер
};
```

---

## API клиент

```typescript
// api/floorPlansApi.ts
import { apiClient } from './client';
import type { FloorPlan, UploadResponse } from '../types/floorPlan';

export const floorPlansApi = {
  upload: (file: File): Promise<UploadResponse> =>
    apiClient.post('/floor-plans/', formData(file)),

  getById: (id: string): Promise<FloorPlan> =>
    apiClient.get(`/floor-plans/${id}`),

  updateWalls: (id: string, walls: Wall[]): Promise<FloorPlan> =>
    apiClient.patch(`/floor-plans/${id}/walls`, { walls }),
};
```

---

## Three.js паттерны

```typescript
// components/ThreeViewer/useThreeScene.ts
export const useThreeScene = (containerRef: RefObject<HTMLDivElement>) => {
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();

  useEffect(() => {
    // Инициализация только при монтировании
    const scene = new THREE.Scene();
    // ...

    return () => {
      // ОБЯЗАТЕЛЬНАЯ очистка при размонтировании
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, []);
};
```

---

## Типы (копии Pydantic схем)

```typescript
// types/floorPlan.ts
export interface Point2D {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  points: Point2D[];
  thickness: number;
}

export interface Room {
  id: string;
  name: string;
  polygon: Point2D[];
  room_type: 'classroom' | 'corridor' | 'staircase' | 'toilet' | 'other';
}

export interface FloorPlan {
  id: string;
  image_url: string;
  walls: Wall[];
  rooms: Room[];
}
```

---

## Запрещено

- `useEffect` без массива зависимостей (кроме mount/unmount)
- Прямые fetch/axios вызовы в компонентах (только через хуки)
- Three.js объекты без dispose() при unmount
- `console.log` в продакшн коде
- Inline стили (только CSS modules или tailwind классы)
