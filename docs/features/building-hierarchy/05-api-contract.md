# API Contract: Building Hierarchy

Префикс: `/api/v1`. Все защищённые админские endpoints требуют `Depends(get_current_admin_user)`. Авторизация через JWT в заголовке `Authorization: Bearer <token>`.

## Buildings

### POST /api/v1/buildings — создать корпус

**Auth:** admin

**Request:**
```json
{
  "code": "D",
  "name": "Корпус D",
  "address": "Владивосток, кампус ДВФУ"
}
```

**Validation:**
- `code`: string, 1..5 символов, `^[A-Z]+$` (нормализуется к верхнему регистру при сохранении)
- `name`: string, 1..255
- `address`: string?, ≤ 512

**Response (201):**
```json
{
  "id": 42,
  "code": "D",
  "name": "Корпус D",
  "address": "Владивосток, кампус ДВФУ",
  "created_at": "2026-05-05T10:30:00Z",
  "floors_count": 0,
  "published": false
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 409 | `{"detail": "Building with code 'D' already exists"}` | code занят |
| 422 | Pydantic ValidationError | code не валиден |
| 403 | `{"detail": "Forbidden"}` | Не админ |

---

### GET /api/v1/buildings — список корпусов

**Auth:** admin (без фильтра) / public (с `published=true`)

**Query:**
- `published`: bool?, default false. Если true — публичный режим, не требует auth и фильтрует только корпуса где есть ≥ 1 секция с `reconstruction.status=Done`

**Response (200, admin):**
```json
[
  {
    "id": 42, "code": "D", "name": "Корпус D",
    "address": null, "created_at": "2026-05-05T10:30:00Z",
    "floors_count": 3, "published": true
  }
]
```

**Response (200, published=true):**
```json
[
  {
    "id": 42, "code": "D", "name": "Корпус D",
    "floors": [
      {
        "id": 101, "number": 7,
        "sections": [
          {
            "id": 555, "number": 4,
            "geometry": {"type": "rect", "points": [[0.1, 0.1], [0.4, 0.5]]},
            "reconstruction_id": 777,
            "mesh_url_glb": "/uploads/abcdef.glb",
            "section_type": 1
          }
        ]
      }
    ]
  }
]
```

**Note:** `published` форма denormalized — фронту хватит одного запроса для каталога.

---

### GET /api/v1/buildings/{id} — детали корпуса

**Auth:** admin

**Response (200):** admin-объект из списка + `floors: FloorBrief[]`. **Errors:** 404.

---

### PATCH /api/v1/buildings/{id} — обновить корпус

**Auth:** admin

**Request:**
```json
{ "name": "Корпус D (главный)", "address": "..." }
```

**Note:** `code` не редактируется (нарушит ссылочные label'ы).

**Response (200):** обновлённый объект.

---

### DELETE /api/v1/buildings/{id} — удалить корпус

**Auth:** admin

**Behavior:** каскадно удаляет floors → sections. `Reconstruction.floor_id` становится NULL.

**Response (204):** пустое. **Errors:** 404.

---

## Floors

### POST /api/v1/buildings/{building_id}/floors — создать этаж

**Auth:** admin

**Request:**
```json
{ "number": 7 }
```

**Validation:** `number`: int, 0..50.

**Response (201):**
```json
{
  "id": 101, "building_id": 42, "number": 7,
  "sections_count": 0, "reconstructions_unbound_count": 0,
  "created_at": "2026-05-05T10:35:00Z"
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 404 | `{"detail": "Building 42 not found"}` | parent отсутствует |
| 409 | `{"detail": "Floor 7 already exists in building D"}` | дубль |

---

### GET /api/v1/buildings/{building_id}/floors — список этажей корпуса

**Auth:** admin. **Response (200):** `FloorResponse[]`, отсортировано по `number` ASC.

---

### GET /api/v1/floors/{id} — детали этажа (с schema)

**Auth:** admin

**Response (200):**
```json
{
  "id": 101,
  "building": {"id": 42, "code": "D", "name": "Корпус D"},
  "number": 7,
  "sections_count": 4,
  "reconstructions_unbound_count": 1,
  "schema_image_id": "uuid-or-null",
  "schema_image_url": "/uploads/abc.jpg",
  "schema_crop_bbox": {"x": 0.05, "y": 0.10, "width": 0.85, "height": 0.70, "rotation": 0},
  "wall_polygons": [[[0.1,0.2],[0.4,0.2]], ...],
  "created_at": "..."
}
```

**Note:** wall_polygons и schema_image_url приходят сразу — это нужно для возобновления редактирования и для рендера end-user'a.

---

### DELETE /api/v1/floors/{id} — удалить этаж

**Auth:** admin. **Behavior:** каскад на sections; reconstructions становятся с `floor_id=NULL`. `schema_image_id` (UploadedFile) НЕ удаляется автоматически (orphan cleanup — отдельным сценарием). **Response (204).**

---

## Floor Schema (новые endpoints для редактора отсеков)

### PUT /api/v1/floors/{id}/schema — загрузить/обновить параметры схемы

**Auth:** admin

**Request:**
```json
{
  "schema_image_id": "uuid-of-uploaded-file",
  "schema_crop_bbox": {
    "x": 0.05, "y": 0.10,
    "width": 0.85, "height": 0.70,
    "rotation": 0
  }
}
```

**Validation:**
- `schema_image_id` существует в uploaded_files и `file_type` = 4 (FloorSchema) или 1 (Plan)
- `schema_crop_bbox` (optional на этом endpoint — если null, считается «весь image без crop»). Все поля в [0,1] кроме `rotation` ∈ {0, 90, 180, 270}

**Response (200):** `FloorWithSchemaResponse` — Floor + schema_image_url + schema_crop_bbox + wall_polygons (если есть).

**Errors:** 404 floor; 422 image_id не найден.

---

### POST /api/v1/floors/{id}/extract-walls — запустить CV для извлечения стен

**Auth:** admin

**Behavior:** sync-вызов processing pipeline (см. `06-pipeline-spec.md`). Может занять до ~30 секунд для большого изображения.

**Request:** body отсутствует (берёт schema_image_id + schema_crop_bbox с Floor).

**Response (200):**
```json
{
  "wall_polygons": [
    [[0.10, 0.20], [0.45, 0.20], [0.45, 0.55]],
    [[0.10, 0.55], [0.45, 0.55]]
  ]
}
```

**Side effect:** `Floor.wall_polygons` обновляется в БД.

**Errors:**
- 404 floor
- 422 если `schema_image_id` не задан → `{"detail": "Floor schema image not uploaded"}`
- 500 если CV pipeline упал → `{"detail": "Wall extraction failed: <reason>"}`

---

### PUT /api/v1/floors/{id}/walls — ручной save полигонов стен (после правки)

**Auth:** admin

**Request:**
```json
{
  "wall_polygons": [
    [[0.10, 0.20], [0.45, 0.20], [0.45, 0.55]]
  ]
}
```

**Validation:** массив полигонов, каждый ≥ 2 точек; все x,y в [0,1].

**Response (200):** `{"wall_polygons": [...]}` (echo).

**Errors:** 404 floor; 422 невалидная геометрия.

---

## Sections

### GET /api/v1/floors/{floor_id}/sections — список секций этажа

**Auth:** admin

**Response (200):**
```json
[
  {
    "id": 555, "floor_id": 101, "number": 4,
    "geometry": {"type": "rect", "points": [[0.1, 0.1], [0.4, 0.5]]},
    "section_type": 1,
    "reconstruction": {
      "id": 777, "name": "D-7-Sec4", "status": 3,
      "preview_url": "/uploads/preview-777.jpg"
    },
    "created_at": "...", "updated_at": "..."
  },
  {
    "id": 556, "floor_id": 101, "number": 5,
    "geometry": {"type": "polygon", "points": [[0.5, 0.2], [0.7, 0.2], [0.7, 0.4], [0.5, 0.4]]},
    "section_type": 1,
    "reconstruction": null,
    "created_at": "...", "updated_at": "..."
  }
]
```

---

### PUT /api/v1/floors/{floor_id}/sections — атомарная замена набора секций

**Auth:** admin

**Request:**
```json
{
  "sections": [
    {
      "number": 4,
      "geometry": {"type": "rect", "points": [[0.1, 0.1], [0.4, 0.5]]},
      "section_type": 1,
      "reconstruction_id": 777
    },
    {
      "number": 5,
      "geometry": {"type": "polygon", "points": [[0.5, 0.2], [0.7, 0.2], [0.7, 0.4]]},
      "section_type": 1,
      "reconstruction_id": null
    }
  ]
}
```

**Validation:**
- `sections`: array, ≤ 50
- Внутри каждой:
  - `number`: int ≥ 1
  - `geometry.points`: array of **ровно 4** [float, float] — повёрнутый прямоугольник (упрощено vs предыдущая версия, см. ADR-28). Discriminator `type` убран
  - все x,y в [0, 1]
  - `section_type`: int, default 1
  - `reconstruction_id`: int? — если задано, **должно существовать** в reconstructions (любого этажа, см. ADR-30); НЕ требуется чтобы floor_id совпадал
- На уровне массива: `number` уникальны; `reconstruction_id` (где не null) уникальны

**Behavior:** транзакционно `DELETE FROM sections WHERE floor_id=? ; INSERT ...`.

**Response (200):** `SectionResponse[]` (как GET).

**Errors:**

| Status | Body | When |
|--------|------|------|
| 404 | `{"detail": "Floor 101 not found"}` | floor отсутствует |
| 422 | `{"detail": "Duplicate section number: 4"}` | дубль |
| 422 | `{"detail": "Reconstruction 777 does not exist"}` | reconstruction отсутствует |
| 422 | `{"detail": "Reconstruction 777 already used by another section in payload"}` | дубль reconstruction |
| 422 | стандартная Pydantic | геометрия невалидна (не 4 точки или x/y вне [0,1]) |

**Removed:** проверка «reconstruction.floor_id == floor_id» — снята согласно ADR-30 (галерея допускает планы любого этажа).

---

### DELETE /api/v1/sections/{id} — удалить одну секцию (опционально)

**Auth:** admin. **Behavior:** удаляет секцию; связанная reconstruction остаётся «висящей». **Response (204).**

---

## Reconstruction (модификации существующих)

### PATCH /reconstruction/reconstructions/{id} — НОВЫЙ: ранняя привязка к этажу

**Auth:** admin

Используется на шаге StepUpload визарда, сразу после выбора building+floor (см. ADR-24).

**Request:**
```json
{ "floor_id": 101 }
```

**Validation:** `floor_id` существует.

**Response (200):** обновлённый `ReconstructionResponse` (см. ниже).

**Errors:** 404 если floor не найден.

---

### PUT /reconstruction/reconstructions/{id}/save — модификация: floor_id вместо building_id+floor_number

**Auth:** admin

**Request (новая форма):**
```json
{ "name": "D-7-Section4", "floor_id": 101 }
```

**Validation:**
- `floor_id`: int, обязательное
- `name`: string, 1..255

**Response (200):** см. ниже расширенный `ReconstructionResponse`.

**Errors:**

| Status | Body | When |
|--------|------|------|
| 404 | `{"detail": "Floor 101 not found"}` | |
| 422 | Pydantic | `floor_id` отсутствует |

---

### GET /reconstruction/reconstructions — модификация: фильтры для галереи

**Auth:** admin

**Query (добавлены):**
- `floor_id`: int? — фильтр по этажу (для редактора отсеков)
- `building_code`: str? — фильтр по корпусу (для PlanGalleryPicker, ADR-30)
- `unbound`: bool?, default false. Если true — только реконструкции без связанной Section
- `status`: int?, default не фильтрует. В галерее (Step5) фронт передаёт `status=3` (Done)
- `search`: str? — substring match по `name` (для PlanGalleryPicker поиска)
- (старые `building_id`, `floor_number` удалены)

**Response (200):**
```json
[
  {
    "id": 777, "name": "D-7-Section4", "status": 3,
    "preview_url": "/uploads/preview-777.jpg",
    "floor": {"id": 101, "number": 7, "building_code": "D"},
    "section": {"id": 555, "number": 4},
    "updated_at": "2026-05-05T11:00:00Z"
  }
]
```

Если план не привязан — `section: null`.

---

### GET /reconstruction/reconstructions/{id} — модификация: расширенный ответ

**Auth:** admin

**Response (200):**
```json
{
  "id": 777, "name": "D-7-Section4", "status": 3,
  "plan_file_id": "uuid", "mask_file_id": "uuid",
  "mesh_file_id_obj": "...obj", "mesh_file_id_glb": "...glb",
  "preview_url": "...", "original_image_url": "...",
  "floor": {
    "id": 101, "number": 7,
    "building": {"id": 42, "code": "D", "name": "Корпус D"}
  },
  "section": {"id": 555, "number": 4},
  "vectorization_data": "...",
  "created_at": "...", "updated_at": "..."
}
```

---

## Pydantic Schemas (sketch)

```python
# backend/app/models/buildings.py — НОВЫЙ
class BuildingCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=5, pattern=r'^[A-Za-z]+$')
    name: str = Field(min_length=1, max_length=255)
    address: str | None = Field(default=None, max_length=512)

    @field_validator('code')
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

class BuildingUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    address: str | None = Field(default=None, max_length=512)

class BuildingResponse(BaseModel):
    id: int
    code: str
    name: str
    address: str | None
    created_at: datetime
    floors_count: int
    published: bool

# backend/app/models/floors.py — НОВЫЙ
class FloorCreateRequest(BaseModel):
    number: int = Field(ge=0, le=50)

class FloorResponse(BaseModel):
    id: int
    building_id: int
    number: int
    sections_count: int
    reconstructions_unbound_count: int
    created_at: datetime

class CropBboxModel(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)
    rotation: int = 0  # validator: only 0/90/180/270

class FloorWithSchemaResponse(FloorResponse):
    building: BuildingBrief
    schema_image_id: str | None
    schema_image_url: str | None
    schema_crop_bbox: CropBboxModel | None
    wall_polygons: list[list[list[float]]] | None  # [polygons[points[x,y]]]

class FloorSchemaUpdateRequest(BaseModel):
    schema_image_id: str
    schema_crop_bbox: CropBboxModel | None = None

class FloorWallsUpdateRequest(BaseModel):
    wall_polygons: list[list[list[float]]]

# backend/app/models/sections.py — НОВЫЙ (ADR-28: упрощено до 4-точечного quad)
class SectionGeometry(BaseModel):
    points: list[list[float]] = Field(min_length=4, max_length=4)

    @field_validator('points')
    @classmethod
    def _bounds(cls, v):
        for pt in v:
            if len(pt) != 2 or not (0 <= pt[0] <= 1 and 0 <= pt[1] <= 1):
                raise ValueError("each point must be [x,y] with 0 <= x,y <= 1")
        return v

class SectionPayloadItem(BaseModel):
    number: int = Field(ge=1)
    geometry: SectionGeometry
    section_type: int = Field(default=1, ge=1, le=10)
    reconstruction_id: int | None = None

class ReplaceSectionsRequest(BaseModel):
    sections: list[SectionPayloadItem] = Field(max_length=50)
```

## Frontend types (мирорим Pydantic)

```typescript
// frontend/src/types/hierarchy.ts — НОВЫЙ
export interface Building {
  id: number;
  code: string;
  name: string;
  address: string | null;
  created_at: string;
  floors_count: number;
  published: boolean;
}

export interface Floor {
  id: number;
  building_id: number;
  number: number;
  sections_count: number;
  reconstructions_unbound_count: number;
  created_at: string;
}

// ADR-28: упрощено — всегда 4-точечный полигон (повёрнутый прямоугольник)
export interface SectionGeometry {
  points: [[number, number], [number, number], [number, number], [number, number]];
}

export interface CropBbox {
  x: number; y: number;
  width: number; height: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface FloorWithSchema extends Floor {
  building: BuildingBrief;
  schema_image_id: string | null;
  schema_image_url: string | null;
  schema_crop_bbox: CropBbox | null;
  wall_polygons: [number, number][][] | null;  // [polygons[points]]
}

export interface ReconstructionBrief {
  id: number;
  name: string | null;
  status: number;
  preview_url: string | null;
}

export interface Section {
  id: number;
  floor_id: number;
  number: number;
  geometry: SectionGeometry;
  section_type: number;
  reconstruction: ReconstructionBrief | null;
  created_at: string;
  updated_at: string;
}

export interface PublicBuilding {
  id: number;
  code: string;
  name: string;
  floors: Array<{
    id: number;
    number: number;
    schema_image_url: string | null;
    schema_crop_bbox: CropBbox | null;
    wall_polygons: [number, number][][] | null;
    sections: Array<{
      id: number;
      number: number;
      geometry: SectionGeometry;
      reconstruction_id: number;
      mesh_url_glb: string;
      section_type: number;
    }>;
  }>;
}
```
