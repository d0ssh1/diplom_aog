# Тикет 28: Визуальный редизайн 3D-модели — стиль 2ГИС с оранжевым кибер-брутализмом

## Статус: TODO
## Приоритет: ВЫСОКИЙ (визуальное качество для ВКР)
## Тип: Research → Design → Implement (feature)
## Затрагиваемые файлы:
- `backend/app/processing/mesh_builder.py` — добавление пола, стеновых крышек, цветов
- `backend/app/processing/mesh_generator.py` — новые функции генерации геометрии
- `frontend/src/components/MeshViewer.tsx` — освещение, тени, материалы, постобработка

---

## Цель

Сделать 3D-модель этажа визуально сопоставимой с 2ГИС Indoor Maps, но с фирменной стилизацией проекта Diplom3D (кибер-брутализм, акцент #FF4500).

### Референс: 2ГИС Indoor Maps (ДВФУ, Политехнический институт)

Что видим в 2ГИС:
1. **Пол** — плоская серая поверхность, тёплый серый (~#C8C4BC), мягкая тень от стен
2. **Стены** — экструдированные на ~3м, бока стен чуть темнее пола (~#A09E98)
3. **Крышки стен** (вид сверху) — плоская горизонтальная поверхность, чуть светлее боков
4. **Комнаты** — заполнены полупрозрачным голубым (~#4DA6D8 при ~40% opacity)
5. **Тени** — мягкие contact shadows от стен на пол, ambient occlusion на стыках стен
6. **Освещение** — мягкий directional свет сверху-сбоку + ambient
7. **Подписи комнат** — плоские текстовые лейблы, парящие над полом

### Наша стилизация (Diplom3D cyber-brutalism)

| Элемент | 2ГИС | Diplom3D |
|---------|-------|----------|
| Пол | Тёплый серый #C8C4BC | Нейтральный серый **#B8B5AD** |
| Бока стен | Серый #A09E98 | Тёмно-серый **#4A4A4A** |
| Крышки стен (top) | Светло-серый | **#FF4500** (оранжевый акцент) |
| Заливка комнат | Голубой 40% | Не нужна (возможно позже) |
| Тени | Мягкие | Мягкие, чуть контрастнее |
| Общее ощущение | Корпоративный, тёплый | Техничный, контрастный |

---

## Фаза 1: Research — изучить текущий код (30 мин)

### 1a. Понять mesh_generator.py

```bash
cat backend/app/processing/mesh_generator.py
```

Найти и задокументировать:
- Функцию `contours_to_polygons()` — как пиксели → метры
- Функцию `extrude_wall()` — как создаётся 3D-экструзия стен
- Константу `WALL_COLOR` — текущий цвет
- Какие грани создаёт экструзия: только бока? бока + крышки?

### 1b. Понять MeshViewer.tsx

```bash
cat frontend/src/components/MeshViewer.tsx
```

Найти и задокументировать:
- Какие lights: AmbientLight, DirectionalLight, HemisphereLight?
- Есть ли shadows (`castShadow`, `receiveShadow`)?
- Какой материал используется для отображения GLB?
- Есть ли постобработка (EffectComposer, SSAO, bloom)?
- Камера: тип (Perspective/Orthographic), позиция, controls

### 1c. Понять trimesh экспорт

GLB формат поддерживает vertex colors. Trimesh записывает `visual.vertex_colors` как RGBA uint8 массив на каждую вершину. Three.js при загрузке через GLTFLoader автоматически создаёт `MeshStandardMaterial` с `vertexColors: true`.

Вопрос для исследования: **Можно ли в одном GLB иметь разные цвета для разных граней?** Да — через vertex colors, каждая вершина может иметь свой цвет. Грани интерполируют цвета вершин, но если все 3 вершины грани имеют одинаковый цвет, грань будет плоско окрашена.

---

## Фаза 2: Design — архитектура изменений

### Backend: mesh_builder.py — новая геометрия

Текущий build_mesh_from_mask генерирует ТОЛЬКО стены (экструдированные контуры). Нужно добавить:

#### 2a. Пол (Floor Plane)

Плоский прямоугольник на уровне Y=0, покрывающий всю площадь маски.

```python
def _create_floor(width_m: float, height_m: float, color: tuple = (184, 181, 173, 255)):
    """Создаёт плоский прямоугольник пола."""
    vertices = np.array([
        [0, 0, 0],
        [width_m, 0, 0],
        [width_m, 0, height_m],
        [0, 0, height_m],
    ], dtype=np.float64)
    faces = np.array([[0, 1, 2], [0, 2, 3]])
    
    floor = trimesh.Trimesh(vertices=vertices, faces=faces)
    colors = np.tile(color, (4, 1)).astype(np.uint8)
    floor.visual.vertex_colors = colors
    return floor
```

Цвет пола: `(184, 181, 173, 255)` — нейтральный тёплый серый #B8B5AD.

#### 2b. Стеновые крышки (Wall Caps) — оранжевые

Текущий `extrude_wall()` из trimesh создаёт только боковые грани. Нужно добавить верхнюю крышку (cap) на каждую стену на высоте floor_height.

**Стратегия:** После экструзии стен, для каждого полигона стены создать плоскую грань (triangulated polygon) на уровне Y=floor_height с оранжевым цветом.

```python
WALL_SIDE_COLOR = (74, 74, 74, 255)    # #4A4A4A — бока стен
WALL_CAP_COLOR  = (255, 69, 0, 255)     # #FF4500 — верхушки стен (оранжевый акцент)
FLOOR_COLOR     = (184, 181, 173, 255)   # #B8B5AD — пол
```

**Реализация wall caps:**
```python
from shapely.geometry import Polygon as ShapelyPolygon
from shapely.ops import triangulate  # или ear-clipping через trimesh

def _create_wall_cap(polygon_coords, height: float, color: tuple):
    """Создаёт плоскую крышку полигона на заданной высоте."""
    # polygon_coords: list of (x, z) координат контура стены в метрах
    # Используем trimesh.creation.extrude_polygon с height=0 
    # или ручную триангуляцию через ear-clipping
    
    from shapely.geometry import Polygon
    import mapbox_earcut as earcut  # или trimesh.path
    
    poly = Polygon(polygon_coords)
    # Триангуляция
    coords_2d = np.array(polygon_coords)
    triangles = earcut.triangulate_float64(coords_2d.reshape(-1), [len(coords_2d)])
    
    vertices_3d = np.column_stack([
        coords_2d[:, 0],
        np.full(len(coords_2d), height),
        coords_2d[:, 1],
    ])
    
    faces = triangles.reshape(-1, 3)
    cap = trimesh.Trimesh(vertices=vertices_3d, faces=faces)
    colors = np.tile(color, (len(vertices_3d), 1)).astype(np.uint8)
    cap.visual.vertex_colors = colors
    return cap
```

**Альтернативный подход (проще):** Использовать `trimesh.creation.extrude_polygon` с `height=0.01` (минимальная толщина), сдвинуть на `floor_height`, покрасить в оранжевый. Это даст тонкую "плёнку" на верхушке стен.

#### 2c. Окрашивание боков стен

Текущий `extrude_wall()` красит все вершины одним WALL_COLOR. Нужно разделить:
- **Вершины на Y=0 и Y=floor_height (бока)** → WALL_SIDE_COLOR (#4A4A4A)
- **Вершины caps (верхняя грань)** → отдельный меш с WALL_CAP_COLOR

Проще всего: НЕ менять extrude_wall, а создавать caps как отдельные меши и concatenate перед экспортом.

### Backend: Обновлённый build_mesh_from_mask

```python
def build_mesh_from_mask(mask, floor_height=3.0, pixels_per_meter=50.0, vr=None):
    # ... существующий код до Step 3 ...
    
    # Step 3: Extrude walls (БОКА — тёмно-серые)
    wall_meshes = []
    cap_meshes = []
    
    for poly in polygons:
        # Боковые грани стен
        wall_mesh = extrude_wall(poly, height=floor_height)
        if wall_mesh is not None:
            colors = np.tile(WALL_SIDE_COLOR, (len(wall_mesh.vertices), 1)).astype(np.uint8)
            wall_mesh.visual.vertex_colors = colors
            wall_meshes.append(wall_mesh)
        
        # Верхняя крышка (оранжевая)
        cap = _create_wall_cap(poly.exterior.coords, floor_height, WALL_CAP_COLOR)
        if cap is not None:
            cap_meshes.append(cap)
    
    # Step 3b: Floor (серый)
    w_m = w / pixels_per_meter
    h_m = h / pixels_per_meter
    floor_mesh = _create_floor(w_m, h_m, FLOOR_COLOR)
    
    # Step 4: Combine ALL
    all_meshes = wall_meshes + cap_meshes + [floor_mesh]
    combined = trimesh.util.concatenate(all_meshes)
    
    # Step 5: Z-up → Y-up
    # ... rotation ...
    
    return combined
```

### Frontend: MeshViewer.tsx — освещение и тени

**ВАЖНО:** MeshViewer.tsx помечен как «НЕ МЕНЯТЬ» в проектных правилах. Для этого тикета делаем **исключение**, т.к. это визуальное улучшение, не меняющее API/функциональность. Но менять аккуратно, только освещение/тени.

#### Целевое освещение (как у 2ГИС)

```tsx
// Мягкий ambient (базовое заполнение)
<ambientLight intensity={0.4} color="#f5f3ee" />

// Основной directional (солнце сверху-слева)
<directionalLight
  position={[10, 20, 10]}
  intensity={0.8}
  color="#ffffff"
  castShadow
  shadow-mapSize-width={2048}
  shadow-mapSize-height={2048}
  shadow-camera-left={-30}
  shadow-camera-right={30}
  shadow-camera-top={30}
  shadow-camera-bottom={-30}
  shadow-bias={-0.0001}
/>

// Hemisphere (небо + отражённый свет от пола)
<hemisphereLight
  args={["#e8e6e0", "#b5b2aa", 0.3]}
/>
```

#### Тени

В `<Canvas>`:
```tsx
<Canvas shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
```

На GLB модели:
```tsx
<mesh castShadow receiveShadow>
  <primitive object={scene} />
</mesh>
```

Пол (если он часть GLB) должен иметь `receiveShadow`.

#### Тональная коррекция (tone mapping)

`ACESFilmicToneMapping` даст приятный кинематографический вид с мягкими тенями, как в 2ГИС.

#### Постобработка (опционально, если react-three/postprocessing доступен)

```tsx
import { EffectComposer, SSAO, Bloom } from '@react-three/postprocessing';

<EffectComposer>
  <SSAO 
    radius={0.4}
    intensity={15}
    luminanceInfluence={0.5}
  />
</EffectComposer>
```

SSAO (Screen Space Ambient Occlusion) создаёт мягкие тени в углах и стыках стен — именно этот эффект делает 2ГИС таким приятным.

---

## Фаза 3: Plan — пошаговый план реализации

### Шаг 1: Добавить цветовые константы (5 мин)

В `mesh_generator.py` или `mesh_builder.py`:
```python
# Diplom3D 3D Color Palette
FLOOR_COLOR     = (184, 181, 173, 255)   # #B8B5AD — нейтральный серый пол
WALL_SIDE_COLOR = (74, 74, 74, 255)      # #4A4A4A — тёмные бока стен
WALL_CAP_COLOR  = (255, 69, 0, 255)      # #FF4500 — оранжевые верхушки стен
```

### Шаг 2: Создать floor mesh (15 мин)

Добавить функцию `_create_floor()` в `mesh_builder.py`. Плоский quad на Y=0.

### Шаг 3: Создать wall cap meshes (30 мин)

Для каждого wall polygon создать плоскую крышку на Y=floor_height. Использовать earcut или `trimesh.path.polygons.medial_axis` (нет, проще earcut или `trimesh.creation.extrude_polygon(poly, height=0.01)`).

**Рекомендация:** Самый простой подход — `trimesh.creation.extrude_polygon` с минимальной высотой, сдвинуть вверх, покрасить. Это гарантирует корректную триангуляцию.

### Шаг 4: Перекрасить боковые стены (5 мин)

Заменить WALL_COLOR на WALL_SIDE_COLOR в цикле создания wall_mesh.

### Шаг 5: Обновить MeshViewer (30 мин)

- Добавить `shadows` в Canvas
- Заменить/добавить lights (ambient + directional + hemisphere)
- Добавить castShadow/receiveShadow на модель
- Добавить tone mapping (ACESFilmic)
- Опционально: SSAO через postprocessing

### Шаг 6: Тестирование (15 мин)

```bash
pytest
npx tsc --noEmit
```

Визуально проверить:
- Серый пол видеен
- Стены тёмно-серые по бокам
- Оранжевые плоские крышки на верхушках стен
- Мягкие тени от стен на пол
- Приятное освещение без пересвета

---

## Чего НЕ делать

- **НЕ менять** координаты/масштаб mesh (pixels_per_meter, scale)
- **НЕ менять** логику контуров и экструзии
- **НЕ ломать** NavigationPath и RoutePanel
- **НЕ ломать** camera controls (орбитальное вращение)
- **НЕ добавлять** тяжёлые эффекты (bloom, DoF) — они замедляют рендеринг
- **НЕ менять** формат GLB (vertex colors поддерживаются нативно)

---

## Зависимости (проверить перед реализацией)

```bash
# Backend — trimesh должен уметь создавать capped extrusions
python3 -c "import trimesh; print(trimesh.__version__)"

# Frontend — проверить есть ли postprocessing
grep "postprocessing" frontend/package.json
# Если нет — установить:
# npm install @react-three/postprocessing
```

---

## Ожидаемый результат

Модель выглядит как профессиональная indoor-карта:
- Серый пол создаёт ощущение пространства
- Тёмные стены — структура здания
- Оранжевые крышки стен — фирменный акцент Diplom3D, видный при виде сверху
- Мягкие тени — глубина и реалистичность
- Бирюзовая линия маршрута (#00ffcc) контрастирует с оранжевым и серым

---

## Связанные тикеты
- Тикет 27: Чёрный монолит + координатное смещение (должен быть починен до этого)