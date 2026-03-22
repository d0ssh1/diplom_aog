# Phase 3: Фронтенд — материалы и освещение

phase: 3
layer: frontend
depends_on: phase-02
design: ../README.md

## Goal

Обновить `MeshViewer.tsx`: использовать vertex colors из GLB вместо перезаписи единым серым,
скорректировать освещение под тёмные стены (#4A4A4A), убрать `FloorPlane` из GLB-пути
(пол теперь часть меша).

## Context

Phase 2 обновила бэкенд: новые GLB файлы содержат vertex colors:
- Бока стен: `#4A4A4A` (тёмно-серый)
- Крышки стен: `#FF4500` (оранжевый)
- Пол: `#B8B5AD` (тёплый серый)

## Files to Modify

### `frontend/src/components/MeshViewer.tsx`

**Изменение 1 — обновить `COLORS` (строки 10-14):**

```tsx
// было:
const COLORS = {
  wall:       '#9E9E9E',
  floor:      '#F5F0E8',
  background: '#ECEFF1',
};

// стало:
const COLORS = {
  wallFallback: '#9E9E9E',  // fallback для OBJ (без vertex colors)
  background:   '#1A1A2E',  // тёмный фон — контраст с оранжевым акцентом
};
```

**Изменение 2 — обновить `applyMapMaterials()` (строки 82-100):**

```tsx
// было:
function applyMapMaterials(root: THREE.Object3D) {
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.wall,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.deleteAttribute('color');  // ← удаляет vertex colors
      child.material = wallMaterial;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

// стало:
function applyMapMaterials(root: THREE.Object3D, useVertexColors: boolean) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: useVertexColors,
    color: useVertexColors ? 0xffffff : COLORS.wallFallback,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}
```

**Изменение 3 — обновить вызовы `applyMapMaterials` в `ObjModel` и `GlbModel`:**

```tsx
// ObjModel (строка 110):
if (ref.current) applyMapMaterials(ref.current, false);  // OBJ — без vertex colors

// GlbModel (строка 130):
if (ref.current) applyMapMaterials(ref.current, true);   // GLB — с vertex colors
```

**Изменение 4 — убрать `FloorPlane` из `GlbModel` (строки 133-139):**

```tsx
// было:
return (
  <>
    <primitive ref={ref} object={scene} />
    <CameraSetup modelRef={ref} />
    <FloorPlane modelRef={ref} />   // ← убрать для GLB
  </>
);

// стало:
return (
  <>
    <primitive ref={ref} object={scene} />
    <CameraSetup modelRef={ref} />
  </>
);
```

`ObjModel` (строки 113-119) — `FloorPlane` оставить (OBJ не содержит пол).

**Изменение 5 — обновить освещение в `Canvas` (строки 162-184):**

```tsx
// было:
<ambientLight intensity={0.7} />
<directionalLight position={[30, 60, 30]} intensity={1.2} castShadow ... />
<directionalLight position={[-20, 30, -20]} intensity={0.3} />
<hemisphereLight args={['#f5f5f0', '#d0d0d8', 0.5]} />

// стало:
{/* Мягкий ambient — снижен для контраста с тёмными стенами */}
<ambientLight intensity={0.5} color="#f0ede8" />

{/* Основной directional — снижен, тени от стен на пол */}
<directionalLight
  position={[30, 60, 30]}
  intensity={0.9}
  castShadow
  shadow-mapSize-width={2048}
  shadow-mapSize-height={2048}
  shadow-camera-far={200}
  shadow-camera-left={-100}
  shadow-camera-right={100}
  shadow-camera-top={100}
  shadow-camera-bottom={-100}
  shadow-bias={-0.001}
/>

{/* Заполняющий */}
<directionalLight position={[-20, 30, -20]} intensity={0.2} />

{/* Hemisphere — тёплый сверху, нейтральный снизу */}
<hemisphereLight args={['#e8e4dc', '#b0aaa0', 0.4]} />
```

**Изменение 6 — обновить `style` в `Canvas` (строка 159):**

```tsx
// было:
style={{ background: COLORS.background }}

// стало:
style={{ background: COLORS.background }}
// (COLORS.background теперь '#1A1A2E')
```

## Verification
- [ ] `npx tsc --noEmit` — без ошибок TypeScript
- [ ] Визуально: тёмный фон, тёмно-серые бока стен, оранжевые крышки, серый пол
- [ ] Тени от стен видны на полу
- [ ] `NavigationPath` (бирюзовый маршрут) отображается корректно
- [ ] `RoutePanel` и `ViewerControls` работают без изменений
- [ ] OBJ формат: fallback серый цвет применяется, `FloorPlane` виден
