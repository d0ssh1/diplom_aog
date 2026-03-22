# Behavior: 3D Color API

## Data Flow Diagrams

### DFD: Generate Mesh with Custom Color

```mermaid
flowchart LR
User([User]) -->|POST /reconstructions<br/>wall_color=#FF5733| Router[API Router]
Router -->|Validate color| Service[ReconstructionService]
Service -->|Parse hex/RGBA| ColorUtil[Color Utils]
ColorUtil -->|Valid RGBA| Service
Service -->|Load mask| Storage[(File Storage)]
Storage -->|Mask image| Service
Service -->|build_mesh_from_mask<br/>wall_color=RGBA| MeshGen[Mesh Generator]
MeshGen -->|Apply color to vertices| Trimesh[trimesh.Trimesh]
Trimesh -->|Export GLB| Storage
Storage -->|Save model| DB[(Database)]
Service -->|Update status=3| DB
Service -->|Response| Router
Router -->|200 JSON| User
```

## Sequence Diagrams

### Use Case 1: Generate Mesh with Custom Hex Color

```mermaid
sequenceDiagram
actor User
participant Router as API Router
participant Service as ReconstructionService
participant ColorUtil as Color Utils
participant MeshGen as Mesh Generator
participant Repo as Repository
participant DB as Database

User->>Router: POST /api/v1/reconstruction/reconstructions
Note over Router: plan_file_id, user_mask_file_id, wall_color="#FF5733"
Router->>Service: build_mesh(plan_file_id, mask_file_id, wall_color="#FF5733")
Service->>ColorUtil: parse_color("#FF5733")
ColorUtil-->>Service: [255, 87, 51, 255]
Service->>MeshGen: build_mesh_from_mask(mask_path, wall_color=[255, 87, 51, 255])
MeshGen-->>Service: trimesh.Trimesh (with vertex colors)
Service->>Repo: save_reconstruction(status=3, url=...)
Repo->>DB: INSERT/UPDATE
DB-->>Repo: OK
Repo-->>Service: Reconstruction record
Service-->>Router: CalculateMeshResponse
Router-->>User: 200 {"id": 123, "url": "/models/123.glb", ...}
```

**Happy path:**
- User provides valid hex color → parsed to RGBA → applied to mesh → GLB exported with colors

### Use Case 2: Generate Mesh with RGBA Array

```mermaid
sequenceDiagram
actor User
participant Router as API Router
participant Service as ReconstructionService
participant ColorUtil as Color Utils

User->>Router: POST /api/v1/reconstruction/reconstructions
Note over Router: wall_color=[100, 150, 200, 255]
Router->>Service: build_mesh(..., wall_color=[100, 150, 200, 255])
Service->>ColorUtil: validate_rgba([100, 150, 200, 255])
ColorUtil-->>Service: Valid
Service->>Service: Continue mesh generation...
```

### Use Case 3: Invalid Color (400 Bad Request)

```mermaid
sequenceDiagram
actor User
participant Router as API Router
participant Service as ReconstructionService
participant ColorUtil as Color Utils

User->>Router: POST /api/v1/reconstruction/reconstructions
Note over Router: wall_color="INVALID"
Router->>Service: build_mesh(..., wall_color="INVALID")
Service->>ColorUtil: parse_color("INVALID")
ColorUtil-->>Service: ColorParseError("Invalid hex format")
Service-->>Router: ColorParseError
Router-->>User: 400 {"detail": "Invalid wall_color: Invalid hex format"}
```

### Use Case 4: Omit Color (Use Default)

```mermaid
sequenceDiagram
actor User
participant Router as API Router
participant Service as ReconstructionService

User->>Router: POST /api/v1/reconstruction/reconstructions
Note over Router: (no wall_color parameter)
Router->>Service: build_mesh(..., wall_color=None)
Service->>Service: Use default WALL_SIDE_COLOR=[74, 74, 74, 255]
Service->>Service: Continue mesh generation...
```

## Error Cases

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Invalid hex format | 400 | `{"detail": "Invalid wall_color: expected #RRGGBB, #RRGGBBAA, or [R, G, B, A] array"}` | Reject, log error |
| Invalid RGBA array | 400 | `{"detail": "Invalid wall_color: RGBA values must be integers in range [0, 255]"}` | Reject, log error |
| Mask file not found | 404 | `{"detail": "Mask file not found"}` | Existing behavior, no change |
| Mesh generation failed | 500 | `{"detail": "Error building 3D model"}` | Existing behavior, no change |

## Edge Cases (Diplom3D-specific)

- **Transparent color** (A < 255) — allowed, trimesh preserves alpha in GLB
- **Black color** (#000000) — allowed, may be hard to see but valid
- **Very bright color** (#FFFFFF) — allowed, may wash out but valid
- **Concurrent requests with different colors** — each generates independent mesh, no conflicts
- **Color parameter with extra whitespace** — strip before parsing (e.g., `" #FF5733 "` → `"#FF5733"`)
