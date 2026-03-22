# Research: 3d-builder-redesign
date: 2026-03-19

## Summary

Текущая 3D-сцена использует React Three Fiber (@react-three/fiber + @react-three/drei). Вся логика рендеринга сосредоточена в одном файле `MeshViewer.tsx` (205 строк) — это монолит, который нарушает стандарт из `threejs_patterns.md` (логика должна быть в хуках). Бэкенд генерирует OBJ и GLB с вшитыми vertex colors, но фронтенд их **удаляет** и применяет единый серый материал. Визуальный стиль — нейтральный серый (#9E9E9E) с тёплым бежевым полом (#F5F0E8), ACES tone mapping, тени 2K.

Для редизайна достаточно изменить только `MeshViewer.tsx` — цвета, материалы, освещение, фон. Бэкенд трогать не нужно.

## Architecture — Current State

### Frontend Structure (relevant to 3d-builder-redesign)

- `frontend/src/components/MeshViewer.tsx:1` — главный компонент 3D-вьювера (205 строк, монолит)
  - `COLORS` object (line 10-14): константы цветов сцены
  - `CameraSetup` (line 19): авто-подгонка камеры под bounding box модели
  - `FloorPlane` (line 55): пол под моделью (MeshLambertMaterial)
  - `applyMapMaterials()` (line 80): применяет материал ко всем мешам, удаляет vertex colors
  - `ObjModel` (line 105): загрузчик OBJ через OBJLoader
  - `GlbModel` (line 125): загрузчик GLB через useGLTF
  - Canvas setup (line 156): фон, тени, tone mapping, gl настройки
  - Lighting (line 162): ambient + 2x directional + hemisphere
  - OrbitControls (line 193): damping, ограничения угла/дистанции

- `frontend/src/hooks/useMeshViewer.ts:1` — только data fetching, Three.js не трогает (49 строк)
- `frontend/src/components/MeshViewer/NavigationPath.tsx:1` — маршрут (cyan #00ffcc, lineWidth 4)
- `frontend/src/components/MeshViewer/RoomLabels.tsx:1` — HTML overlay метки комнат
- `frontend/src/components/MeshViewer/ViewerControls.tsx:1` — UI кнопки (top/3d view, download GLB)
- `frontend/src/components/MeshViewer/RoutePanel.tsx:1` — UI панель маршрута
- `frontend/src/pages/ViewMeshPage.tsx:1` — standalone страница просмотра (60 строк)
- `frontend/src/components/Wizard/StepView3D.tsx:1` — шаг 5 визарда, оборачивает MeshViewer (76 строк)

### Backend Structure (relevant to 3d-builder-redesign)

- `backend/app/processing/mesh_generator.py:43` — цветовая палитра vertex colors:
  - `WALL_COLOR`: [230, 230, 230, 255] — светло-серый
  - `DEFAULT_FLOOR_COLOR`: [245, 240, 232, 255] — бежевый
  - `ROOM_COLORS`: classroom=жёлтый, corridor=синий, staircase=красный, toilet=бирюзовый
- `backend/app/processing/mesh_builder.py:134` — вшивает WALL_COLOR в vertex colors каждого меша
- `backend/app/services/reconstruction_service.py:183` — экспортирует OBJ + GLB в `uploads/models/`

## Current Visual Settings

### Colors
| Элемент | Hex | Где задан |
|---------|-----|-----------|
| Стены | `#9E9E9E` | `MeshViewer.tsx:11` |
| Пол | `#F5F0E8` | `MeshViewer.tsx:12` |
| Фон сцены | `#ECEFF1` | `MeshViewer.tsx:13` |
| Маршрут | `#00ffcc` | `NavigationPath.tsx:23` |
| Hemisphere top | `#f5f5f0` | `MeshViewer.tsx:184` |
| Hemisphere bottom | `#d0d0d8` | `MeshViewer.tsx:184` |

### Materials
- Стены: `MeshStandardMaterial` — roughness 0.85, metalness 0.0, DoubleSide (`MeshViewer.tsx:83`)
- Пол: `MeshLambertMaterial` — DoubleSide (`MeshViewer.tsx:74`)
- Vertex colors из GLB/OBJ **удаляются** фронтендом (`MeshViewer.tsx:94`)

### Lighting
- Ambient: intensity 0.7 (`MeshViewer.tsx:163`)
- Directional main: position [30,60,30], intensity 1.2, shadows 2048x2048 (`MeshViewer.tsx:166`)
- Directional fill: position [-20,30,-20], intensity 0.3 (`MeshViewer.tsx:181`)
- Hemisphere: warm top / cool bottom, intensity 0.5 (`MeshViewer.tsx:184`)

### Camera & Controls
- Initial position: [0, 50, 20], FOV 45° (`MeshViewer.tsx:157`)
- Auto-fit: isometric ~70° top-down view (`MeshViewer.tsx:33`)
- OrbitControls: dampingFactor 0.08, maxPolarAngle π/2.1, distance 1–500 (`MeshViewer.tsx:193`)

### Renderer
- `ACESFilmicToneMapping`, exposure 1.1 (`MeshViewer.tsx:160`)
- antialias: true, shadows enabled

## Closest Analog Feature

Нет прямого аналога — это единственный 3D-вьювер в проекте.

## Integration Points

- Backend: экспортирует GLB по пути `/api/v1/uploads/models/reconstruction_{id}.glb`
- Frontend: загружает GLB через `useGLTF(url)` или OBJ через `OBJLoader`
- Формат определяется по расширению URL (`ViewMeshPage.tsx:45`)
- Vertex colors в GLB **игнорируются** — фронтенд применяет свой материал

## Gaps (что нужно для редизайна)

- `MeshViewer.tsx` — монолит, нарушает `threejs_patterns.md` (логика должна быть в хуках)
- Нет `hooks/` директории — всё в компонентах (нарушение стандарта)
- Нет отдельного файла для констант визуального стиля (цвета, материалы)
- Нет поддержки разных цветов по типу комнаты (vertex colors удаляются)
- Нет cleanup/dispose при unmount в Canvas компоненте (потенциальная утечка памяти)

## Key Files

- `frontend/src/components/MeshViewer.tsx` — **главный файл для редизайна** (все цвета, материалы, освещение)
- `frontend/src/components/MeshViewer/NavigationPath.tsx` — цвет маршрута
- `backend/app/processing/mesh_generator.py` — vertex colors в экспортируемом меше (если нужно использовать)
- `backend/app/processing/mesh_builder.py` — применение vertex colors к мешу
