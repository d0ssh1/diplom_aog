# Behavior: Massive Stitching / Transition Points

## Data Flow Diagrams

### DFD: Transition CRUD and Multi-Plan Routing

```mermaid
flowchart LR
User([User]) -->|Create/edit transitions| FE[Frontend]
User -->|Request route| FE
FE -->|HTTP JSON| API[FastAPI Router]
API -->|Validate| Service[Transition / Navigation Service]
Service -->|Read/write| Repo[Repository]
Repo -->|SQL| DB[(Database)]
Service -->|Load plan graphs| Storage[(File Storage)]
Service -->|Combine graphs + find path| Processing[Processing helpers]
Processing -->|Route result| Service
Service -->|Response DTO| API
API -->|JSON| FE
```

## Sequence Diagrams

### Use Case 1: Create a transition group

```mermaid
sequenceDiagram
actor User
participant Router as API Router
participant Service
participant Repo as Repository
participant DB as Database

User->>Router: POST /api/v1/transitions/groups
Router->>Service: create_group(request, user_id)
Service->>Repo: create_group(...)
Repo->>DB: INSERT transition_groups
DB-->>Repo: OK
Repo-->>Service: TransitionGroup
Service-->>Router: TransitionGroupResponse
Router-->>User: 201 JSON
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Invalid body | 400 | ValidationError | Return Pydantic validation error details |
| Authentication missing | 401 | Unauthorized | Reject request before service call |
| Storage or DB failure | 500 | Safe error | Log and return generic error |

### Use Case 2: Create a transition point

```mermaid
sequenceDiagram
actor User
participant Router as API Router
participant Service
participant Repo as Repository
participant Storage as File Storage
participant Processing
participant DB as Database

User->>Router: POST /api/v1/transitions/points
Router->>Service: create_point(request, user_id)
Service->>Repo: get_reconstruction(reconstruction_id)
Repo->>DB: SELECT reconstruction
DB-->>Repo: row
Repo-->>Service: Reconstruction
Service->>Storage: load nav graph for reconstruction
Storage-->>Service: graph JSON or missing
Service->>Processing: snap point to nearest reachable node
Processing-->>Service: snapped node or none
alt snapped node found
  Service->>Repo: create_point(...)
  Repo->>DB: INSERT transition_points
  DB-->>Repo: OK
  Repo-->>Service: TransitionPoint
  Service-->>Router: TransitionPointResponse
  Router-->>User: 201 JSON
else no reachable node
  Service-->>Router: 400 error
  Router-->>User: 400 JSON
end
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Reconstruction not found | 404 | {"detail": "..."} | Reject point creation |
| Point outside reachable area | 400 | {"detail": "point out of reachable area"} | Do not persist point |
| Invalid coordinates | 400 | ValidationError | Reject before service call |

### Use Case 3: Build a multi-plan route

```mermaid
sequenceDiagram
actor User
participant Router as API Router
participant Service
participant Repo as Repository
participant Storage as File Storage
participant Processing

User->>Router: POST /api/v1/navigation/route/multi
Router->>Service: find_multi_plan_route(request)
Service->>Repo: load participating reconstructions and transition points
Repo-->>Service: reconstructions + transitions
Service->>Storage: load each plan nav graph JSON
Storage-->>Service: deserialized graphs
Service->>Processing: build_super_graph(graphs, transitions)
Processing-->>Service: super graph
Service->>Processing: find_multi_plan_route(super_graph, start, goal)
Processing-->>Service: route segments + distance
Service-->>Router: MultiPlanRouteResponse
Router-->>User: 200 JSON
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Target reconstruction unreachable | 404 or 200 no_path | {"status":"no_path"} | Return safe no-path result |
| Missing nav graph file | 400 | {"detail": "..."} | Report missing prerequisite |
| No path between groups | 200 | {"status":"no_path"} | Return structured no-path response |

**Edge cases (Diplom3D-specific):**
- Multiple transition points may belong to the same group; the route must treat the group as the logical connector, not the individual point.
- Transition point coordinates are normalized `[0,1]`; denormalization happens only when combining with a specific reconstruction’s graph.
- Current nav graph nodes are file-based per mask, so multi-plan routing must load several graph JSON files and prefix node IDs to avoid collisions.
- The frontend must still support single-plan navigation while multi-plan routing is added.

### Use Case 4: Visualize multi-plan route segments in the viewer

```mermaid
sequenceDiagram
actor User
participant Page as Frontend Page
participant Hook as useTransitions / route hook
participant API as Backend API
participant Viewer as MeshViewer

User->>Page: Request route visualization
Page->>Hook: call route API
Hook->>API: POST /api/v1/navigation/route/multi
API-->>Hook: MultiPlanRouteResponse
Hook-->>Page: typed route result
Page->>Viewer: pass route segments
Viewer-->>User: render segmented route overlay
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| No route result | 200 | {"status":"no_path"} | Show empty-state message |
| Invalid route input | 400 | ValidationError | Show field-level error |

## Use Case Coverage Summary
- Transition group CRUD
- Transition point CRUD with reachability validation
- Multi-plan route assembly and search
- Frontend route-segment visualization
