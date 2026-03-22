# Research: 3D Wall Colors System
date: 2026-03-20

## Summary

Система цветов 3D-модели в Diplom3D использует **vertex colors** (цвета вершин), которые задаются на бэкенде при генерации меша и применяются на фронтенде через Three.js материалы. Цвета определены в `backend/app/processing/mesh_generator.py` и применяются в двух местах:
1. **Backend** — при экструзии стен в `mesh_builder.py` (строки 192-193)
2. **Frontend** — при рендеринге в `MeshViewer.tsx` (строки 81-98)

Текущая цветовая схема — **cyber-brutalism palette** (commit 3ef3a81):
- Боковые стороны стен: `#4A4A4A` (тёмно-серый)
- Верхние крышки стен: `#FF4500` (оранжевый)
- Пол: `#B8B5AD` (тёплый серый)

## Architecture — Current State

### Backend: Mesh Generation Pipeline

**Entry Point**: `POST /api/v1/reconstruction/reconstructions`
- Handler: `backend/app/api/reconstruction.py:127-150`
- Calls: `ReconstructionService.build_mesh()` (line 133)

**Service Layer**: `backend/app/services/reconstruction_service.py:54-196`
- Line 176-181: Calls `build_mesh_from_mask(mask_array, floor_height, pixels_per_meter, vr)`
- Line 190-191: Exports mesh to OBJ and GLB files

**Processing Layer**: `backend/app/processing/mesh_builder.py:73-212`
- `build_mesh_from_mask()` — main function
- Line 100-106: Imports color constants from `mesh_generator.py`
- Line 188-194: Extrudes walls and assigns `WALL_SIDE_COLOR` to vertices
- Line 204-210: Applies Z-up → Y-up rotation (Three.js convention)

**Color Definitions**: `backend/app/processing/mesh_generator.py:36-58`
```python
# Lines 43-49: Cyber-brutalism palette
WALL_SIDE_COLOR: list = [74, 74, 74, 255]      # #4A4A4A — wall sides
WALL_CAP_COLOR: list  = [255, 69, 0, 255]      # #FF4500 — wall tops
FLOOR_COLOR: list     = [184, 181, 173, 255]   # #B8B5AD — floor

# Lines 51-58: Room type colors (not currently used in mesh_builder)
ROOM_COLORS: dict = {
    "classroom":  [245, 197, 66,  255],   # yellow  #f5c542
    "corridor":   [66,  135, 245, 255],   # blue    #4287f5
    "staircase":  [245, 66,  66,  255],   # red     #f54242
    "toilet":     [66,  245, 200, 255],   # teal    #42f5c8
    "other":      [200, 200, 200, 255],   # grey    #c8c8c8
}
```

**Key Functions**:
- `mesh_generator.py:160-182` — `extrude_wall(polygon, height)` — creates 3D mesh from 2D polygon
- `mesh_generator.py:294-357` — `assign_room_colors(mesh, rooms, ...)` — assigns colors by room type (NOT used in current pipeline)
- `mesh_builder.py:188-194` — applies `WALL_SIDE_COLOR` to all wall vertices

### Frontend: 3D Rendering

**Entry Point**: `frontend/src/pages/ViewMeshPage.tsx`
- Fetches reconstruction data via API
- Passes `url` (OBJ/GLB file path) to `<MeshViewer>`

**Main Component**: `frontend/src/components/MeshViewer.tsx:1-201`

**Material Assignment**: `MeshViewer.tsx:81-98`
```typescript
function applyMapMaterials(root: THREE.Object3D, useVertexColors: boolean) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const hasColors = useVertexColors && child.geometry.hasAttribute('color');
      const material = new THREE.MeshStandardMaterial({
        vertexColors: hasColors,
        color: hasColors ? 0xffffff : COLORS.wallFallback,  // #9E9E9E
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
      child.material = material;
    }
  });
}
```

**Key Details**:
- Line 85: Checks if geometry has `color` attribute (vertex colors from backend)
- Line 87: `vertexColors: true` — enables per-vertex coloring
- Line 88: `color: 0xffffff` (white) if vertex colors exist — acts as multiplier
- Line 88: `color: 0x9E9E9E` (gray) fallback if no vertex colors
- Line 108: OBJ loader calls `applyMapMaterials(ref.current, false)` — no vertex colors
- Line 128: GLB loader calls `applyMapMaterials(ref.current, true)` — uses vertex colors

**Loaders**:
- `MeshViewer.tsx:103-118` — `ObjModel` — uses `useLoader(OBJLoader, url)`
- `MeshViewer.tsx:123-138` — `GlbModel` — uses `useGLTF(url)` from drei

**Lighting**: `MeshViewer.tsx:160-182`
- Ambient light: `#f0ede8`, intensity 0.5
- Main directional: position `[30, 60, 30]`, intensity 0.9, shadows enabled
- Fill directional: position `[-20, 30, -20]`, intensity 0.2
- Hemisphere: top `#e8e4dc`, bottom `#b0aaa0`, intensity 0.4

## Data Flow: Color Assignment

```
1. Backend: mesh_builder.py:176-181
   build_mesh_from_mask(mask_array, floor_height, pixels_per_meter, vr)

2. Backend: mesh_builder.py:188-194
   for poly in polygons:
       wall_mesh = extrude_wall(poly, height=floor_height)
       colors = np.tile(WALL_SIDE_COLOR, (len(wall_mesh.vertices), 1))
       wall_mesh.visual.vertex_colors = colors  ← VERTEX COLORS SET HERE

3. Backend: mesh_builder.py:190-191
   mesh.export(obj_path)  ← OBJ format does NOT preserve vertex colors
   mesh.export(glb_path)  ← GLB format DOES preserve vertex colors

4. Frontend: MeshViewer.tsx:124-128 (GLB path)
   const { scene } = useGLTF(url)
   applyMapMaterials(ref.current, true)  ← useVertexColors=true

5. Frontend: MeshViewer.tsx:86-92
   const material = new THREE.MeshStandardMaterial({
       vertexColors: true,  ← enables vertex colors
       color: 0xffffff,     ← white multiplier (shows vertex colors as-is)
   })
```

## How to Change Wall Colors

### Option 1: Change Backend Constants (Recommended)

**File**: `backend/app/processing/mesh_generator.py:43-49`

Change the RGB values:
```python
WALL_SIDE_COLOR: list = [74, 74, 74, 255]      # current: dark grey
WALL_CAP_COLOR: list  = [255, 69, 0, 255]      # current: orange (not used)
FLOOR_COLOR: list     = [184, 181, 173, 255]   # current: warm grey (not used)
```

**Impact**: All new meshes will use the new colors. Existing GLB files must be regenerated.

**Example** — change walls to blue:
```python
WALL_SIDE_COLOR: list = [66, 135, 245, 255]  # blue #4287f5
```

### Option 2: Add Room-Based Coloring

**File**: `backend/app/processing/mesh_builder.py:203-210`

Currently, `build_mesh_from_mask()` does NOT use room colors. To enable:

1. After line 204 (`combined = _trimesh.util.concatenate(meshes)`), add:
```python
# Apply room colors if VectorizationResult provided
if vr and vr.rooms:
    from app.processing.mesh_generator import assign_room_colors
    combined = assign_room_colors(
        combined,
        vr.rooms,
        pixels_per_meter,
        image_width=w,
        image_height=h,
    )
```

2. This will color floor vertices by room type using `ROOM_COLORS` dict.

**Note**: `assign_room_colors()` exists in `mesh_generator.py:294-357` but is NOT called in current pipeline.

### Option 3: Change Frontend Material (Quick Test)

**File**: `frontend/src/components/MeshViewer.tsx:88`

Change the base color multiplier:
```typescript
color: hasColors ? 0xffffff : COLORS.wallFallback,
```

To:
```typescript
color: hasColors ? 0x4287f5 : COLORS.wallFallback,  // blue tint
```

**Impact**: Multiplies vertex colors by this value. Only affects visual appearance, does NOT change exported files.

### Option 4: Dynamic Color API (Future)

Add color parameters to `POST /api/v1/reconstruction/reconstructions`:
```python
# Request model
class CalculateMeshRequest(BaseModel):
    plan_file_id: str
    user_mask_file_id: str
    wall_color: Optional[str] = "#4A4A4A"  # hex color

# In reconstruction_service.py:176
wall_color_rgb = hex_to_rgb(request.wall_color)
mesh = build_mesh_from_mask(
    mask_array,
    floor_height=settings.DEFAULT_FLOOR_HEIGHT,
    pixels_per_meter=pixels_per_meter,
    vr=vectorization_result,
    wall_color=wall_color_rgb,  # pass to function
)
```

Requires modifying `build_mesh_from_mask()` signature to accept `wall_color` parameter.

## Integration Points

### Database
- `backend/app/db/models.py` — `Reconstruction` ORM model
- Stores `obj_path` and `glb_path` (file paths, not color data)
- No color metadata stored in DB currently

### File Storage
- OBJ files: `backend/uploads/models/reconstruction_{id}.obj` — NO vertex colors
- GLB files: `backend/uploads/models/reconstruction_{id}.glb` — HAS vertex colors
- Frontend MUST use GLB format to see backend-assigned colors

### API Boundaries
- `POST /api/v1/reconstruction/reconstructions` — triggers mesh generation
- Response: `CalculateMeshResponse` with `url` field (path to GLB/OBJ)
- No color parameters in current API

### Processing Pipeline
- `mesh_builder.py:176` — `build_mesh_from_mask()` is the ONLY place where mesh is built
- `mesh_generator.py:160` — `extrude_wall()` creates geometry (no color)
- `mesh_builder.py:192` — vertex colors assigned AFTER extrusion

## Existing Patterns to Reuse

### Pattern 1: Vertex Color Assignment
**Found at**: `mesh_builder.py:192-193`
```python
colors = np.tile(WALL_SIDE_COLOR, (len(wall_mesh.vertices), 1)).astype(np.uint8)
wall_mesh.visual.vertex_colors = colors
```
- `np.tile()` repeats color array for each vertex
- `astype(np.uint8)` ensures RGBA values are 0-255
- `mesh.visual.vertex_colors` is trimesh API for per-vertex colors

### Pattern 2: Room-Based Coloring
**Found at**: `mesh_generator.py:294-357` — `assign_room_colors()`
- Iterates over rooms, finds vertices within room radius
- Assigns color based on `room.room_type` from `ROOM_COLORS` dict
- Uses spatial distance check: `dist < radius`

### Pattern 3: Material Creation (Frontend)
**Found at**: `MeshViewer.tsx:86-92`
```typescript
const material = new THREE.MeshStandardMaterial({
  vertexColors: hasColors,
  color: hasColors ? 0xffffff : COLORS.wallFallback,
  roughness: 0.8,
  metalness: 0.0,
  side: THREE.DoubleSide,
});
```
- `MeshStandardMaterial` — PBR material with lighting
- `vertexColors: true` — enables per-vertex coloring
- `color` acts as multiplier when vertex colors present

## Gaps (What's Missing)

1. **No API for dynamic colors** — wall color is hardcoded in `mesh_generator.py`, cannot be changed per request
2. **Room colors not used** — `assign_room_colors()` exists but NOT called in `build_mesh_from_mask()`
3. **OBJ format loses colors** — OBJ export does NOT preserve vertex colors, only GLB does
4. **No color metadata in DB** — `Reconstruction` model does not store color scheme used
5. **No frontend color picker** — UI has no way to request custom colors
6. **Wall caps not rendered** — `WALL_CAP_COLOR` defined but `_create_wall_cap()` NOT called in current pipeline

## Key Files

- `backend/app/processing/mesh_generator.py` — color constants (lines 43-58), helper functions
- `backend/app/processing/mesh_builder.py` — mesh generation entry point (line 73), color assignment (line 192)
- `backend/app/services/reconstruction_service.py` — service layer, calls `build_mesh_from_mask()` (line 176)
- `backend/app/api/reconstruction.py` — API endpoint (line 127)
- `frontend/src/components/MeshViewer.tsx` — Three.js renderer, material assignment (line 81)
- `frontend/src/pages/ViewMeshPage.tsx` — page wrapper, fetches reconstruction data

## Closest Analog Feature

**Navigation Path Rendering** (`frontend/src/components/MeshViewer/NavigationPath.tsx`)
- Uses custom color (`#00ffcc` cyan) for path visualization
- Demonstrates how to add colored overlays to 3D scene
- Pattern: define color constant → pass to Three.js material

**Similarity**: Both use Three.js materials with explicit colors. Difference: NavigationPath uses `Line` component with `color` prop, walls use `MeshStandardMaterial` with `vertexColors`.

## Next Steps

To implement dynamic wall colors:

1. **Design Phase**: `/design_feature 3d-color-api backend "Add API parameter for custom wall colors"`
2. **Implementation**:
   - Modify `CalculateMeshRequest` to accept `wall_color: str` (hex)
   - Add `hex_to_rgb()` helper in `mesh_generator.py`
   - Pass color to `build_mesh_from_mask()` as parameter
   - Update `mesh_builder.py:192` to use passed color instead of constant
3. **Frontend** (optional):
   - Add color picker in wizard step
   - Pass color to API request

To enable room-based coloring:

1. Uncomment/add call to `assign_room_colors()` in `mesh_builder.py:204`
2. Ensure `VectorizationResult.rooms` has correct `room_type` values
3. Test with GLB export (OBJ will not show colors)
