# Design Decisions: shift-fix

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Single geometric reference frame | Use the saved crop/rotation metadata as the common reference for preview mask, saved mask, reconstruction, and nav graph | Recompute geometry independently in each step | The research shows the same flow already carries crop/rotation through multiple layers; alignment bugs are most likely when those parameters diverge between steps (`docs/research/Исследуй.md:4-8`). |
| 2 | Frontend/editor coordinates follow backend normalization rules | Keep canvas/editing coordinates mapped to the same normalized image space that reconstruction uses | Store editor-specific pixel coordinates and convert later ad hoc | Standards require all coordinates after vectorization to be normalized to `[0, 1]`, and the research shows `pipeline.py` already normalizes coordinates (`docs/research/Исследуй.md:6,62`). |
| 3 | The bug fix spans frontend and backend | Treat this as a fullstack alignment fix rather than a single-layer UI issue | Frontend-only or backend-only patch | The shift appears in preprocess preview, manual editor, and emergency-plan output, so the bug crosses the upload, processing, reconstruction, and viewer flows (`docs/research/Исследуй.md:4-8,52-55`). |
| 4 | Keep existing API surface unless alignment requires contract changes | Reuse current endpoints for preview, reconstruction, vectorization save, and nav graph | Add new endpoints for alignment metadata | The current flow already has endpoints for preview, reconstruction, vectors, and nav graph; the main problem is consistency, not missing resources (`docs/research/Исследуй.md:13-21,69`). |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Different layers interpret crop origin differently | High | Define one transformation chain and apply it in every render/save path |
| Manual editor overlay does not match saved vectorization frame | High | Persist and reload crop/rotation metadata with vectorization data |
| Reconstruction and nav graph consume mismatched coordinates | High | Ensure both read the same normalized geometry source |
| Placeholder endpoints hide partial behavior | Medium | Document current placeholder routes and avoid relying on them for alignment-critical flows |

## Open Questions

- [ ] Should crop/rotation metadata be stored explicitly inside `VectorizationResult` for round-tripping in editor and reconstruction flows?
- [ ] Should room/cabinet positions be re-derived from image-space coordinates on every save, or stored and transformed once?
- [ ] Which component owns the authoritative origin for the emergency-plan view: frontend canvas, mask service, or reconstruction service?
- [x] Is this a fullstack issue? Yes — the research shows affected paths on both frontend and backend.
