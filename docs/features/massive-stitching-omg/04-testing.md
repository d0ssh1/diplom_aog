# Testing Strategy: Massive Stitching / Transition Points

## Test Rules
- Follow AAA structure.
- Use `pytest` and `pytest-asyncio` for backend async tests.
- Use HTTP client tests for API endpoints.
- Keep processing tests isolated from DB and HTTP.
- Every new business rule and error path must have a corresponding test.

## Test Structure

```
backend/tests/
├── processing/
│   └── test_multi_plan_graph.py
├── services/
│   └── test_transition_service.py
└── api/
    ├── test_transitions_api.py
    └── test_navigation_api.py

frontend/src/
└── __tests__/
    └── transitions.page.test.tsx
```

## Coverage Mapping

### Processing Function Coverage

| Function | Business Rule | Test Name |
|----------|---------------|-----------|
| `snap_to_graph()` | Finds nearest reachable node within a radius | `test_snap_finds_nearest_corridor_node_within_radius` |
| `snap_to_graph()` | Returns `None` when no node is close enough | `test_snap_returns_none_when_no_node_in_radius` |
| `build_super_graph()` | Prefixes node IDs to avoid collisions | `test_build_super_graph_prefixes_node_ids` |
| `build_super_graph()` | Adds transition links between grouped points | `test_build_super_graph_adds_transition_clique_edges` |
| `find_multi_plan_route()` | Returns route segments for connected plans | `test_find_route_across_two_plans_via_single_group` |
| `find_multi_plan_route()` | Chooses the cheapest available connection | `test_find_route_chooses_cheapest_when_two_groups_connect_same_plans` |
| `find_multi_plan_route()` | Reports no path when destination is unreachable | `test_no_path_when_target_plan_not_reachable` |

### Service Coverage

| Method | Scenario | Test Name |
|--------|----------|-----------|
| `create_group()` | Happy path | `test_create_group_succeeds` |
| `create_group()` | Invalid payload | `test_create_group_invalid_payload_raises_validation_error` |
| `create_point()` | Happy path with valid snap target | `test_create_point_succeeds_when_snap_is_valid` |
| `create_point()` | No reachable graph node | `test_create_point_out_of_reachable_area_raises_error` |
| `update_point()` | Point not found | `test_update_point_missing_entity_raises_404` |
| `delete_group()` | Cascades to points | `test_delete_group_removes_points_cascade` |
| `find_multi_plan_route()` | Multi-plan success | `test_find_multi_plan_route_returns_segments` |
| `find_multi_plan_route()` | No path | `test_find_multi_plan_route_no_path_returns_structured_result` |

### API Endpoint Coverage

| Endpoint | Status | Test Name |
|----------|--------|-----------|
| `POST /api/v1/transitions/groups` | 201 | `test_create_transition_group_201` |
| `POST /api/v1/transitions/groups` | 400 | `test_create_transition_group_invalid_input_400` |
| `GET /api/v1/transitions/groups?building_id=...` | 200 | `test_list_transition_groups_200` |
| `PATCH /api/v1/transitions/groups/{id}` | 200 | `test_update_transition_group_200` |
| `DELETE /api/v1/transitions/groups/{id}` | 204 | `test_delete_transition_group_204` |
| `POST /api/v1/transitions/points` | 201 | `test_create_transition_point_201` |
| `POST /api/v1/transitions/points` | 400 | `test_create_transition_point_out_of_reachable_area_400` |
| `PATCH /api/v1/transitions/points/{id}` | 200 | `test_update_transition_point_200` |
| `DELETE /api/v1/transitions/points/{id}` | 204 | `test_delete_transition_point_204` |
| `GET /api/v1/transitions/reconstructions/{id}/points` | 200 | `test_list_points_by_reconstruction_200` |
| `GET /api/v1/transitions/buildings/{id}/points` | 200 | `test_list_points_by_building_200` |
| `POST /api/v1/navigation/route/multi` | 200 | `test_find_multi_plan_route_200` |
| `POST /api/v1/navigation/route/multi` | 200 | `test_find_multi_plan_route_no_path_200` |
| `POST /api/v1/navigation/route/multi` | 400 | `test_find_multi_plan_route_invalid_input_400` |

### Frontend Coverage

| Component / Hook | Scenario | Test Name |
|------------------|----------|-----------|
| `TransitionsPage` | Renders initial state | `test_transitions_page_renders` |
| `useTransitions` | Loads groups and points | `test_use_transitions_loads_data` |
| `TransitionCanvas` | Renders markers for selected floor | `test_transition_canvas_renders_markers` |
| `GroupPanel` | Shows selected point and group details | `test_group_panel_displays_selection` |
| `MultiPlanRoutePanel` | Renders segmented route summary | `test_route_panel_renders_segments` |

## Test Count Summary

| Layer | Tests |
|-------|-------|
| Processing | 7 |
| Service | 8 |
| API | 14 |
| Frontend | 5 |
| **TOTAL** | **34** |
