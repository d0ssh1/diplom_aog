# Pipeline Specification: Massive Stitching / Transition Points

## Where in the Pipeline

```text
[1] Single-plan reconstruction and nav-graph generation → [2] Transition point creation/editing → [3] Super-graph assembly → [4] Multi-plan route search
```

This feature does not change the image-processing pipeline. It consumes the output of the existing reconstruction and navigation pipeline.

## Input / Output

### Super-graph assembly input
- `plan_data`: list of per-plan graph payloads loaded from nav graph JSON files
- `transition_points`: list of transition points with normalized coordinates
- `group data`: transition group metadata, including logical type and label

### Super-graph assembly output
- `networkx.Graph` representing a combined route graph
- `mapping` from transition point IDs to node IDs in the combined graph
- multi-plan route result containing ordered segments and total distance

## Algorithm

### 1. Load plan-local graph data
- Read each plan’s nav graph JSON from storage.
- Restore nodes, edges, positions, and metadata.
- Keep each plan independent until graph composition.

### 2. Prefix node identifiers
- Prefix every plan-local node ID with the reconstruction identity.
- Preserve existing room/door/corridor semantics.
- Avoid collisions across plans when combining graphs.

### 3. Convert transition points to plan-local positions
- Transition points are stored normalized `[0,1]`.
- Denormalize them using the target reconstruction’s mask/image dimensions.
- Map the denormalized position into the plan-local coordinate system used by the nav graph.

### 4. Snap transition points to reachable graph nodes
- Search for the nearest corridor or door node within a configured radius.
- If no node is within radius, reject the point for editing flows and skip it in read flows.
- Preserve the snapped node ID for debug and UI display.

### 5. Connect groups and build cross-plan links
- Group points become logical connectors.
- Add edges between points in the same group.
- The edge weight is configurable by group type, but the first implementation may use zero weight.

### 6. Search for a route
- Run A* on the combined graph.
- Split the resulting path into route segments by reconstruction boundary.
- Convert path fragments into route geometry for frontend visualization.

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| snap_radius_ratio | float | 0.15 | Radius used to find a reachable node near a transition point |
| group_edge_weight | float | 0.0 | Initial cross-point edge weight for same-group links |
| heuristic | callable | zero heuristic | Path search heuristic for multi-plan routes |

## Error Handling

| Condition | Exception | Message |
|-----------|------------|---------|
| Missing nav graph file | ValueError | "nav graph missing" or similar safe message |
| Point outside reachable area | ValueError | "point out of reachable area" |
| Invalid route request | ValidationError | Pydantic validation details |
| No path | Structured no-path response | `status = "no_path"` |
