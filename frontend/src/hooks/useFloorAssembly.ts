// State + actions for the four Floor-Editor assembly steps (UC2–UC5):
// bind master control points → solve transforms → draw connectors → build &
// confirm the stitched floor mesh.
//
// This is a NEW sibling of useFloorEditorWizard (it does NOT replace it). The
// wizard owns sections/crop/walls (steps 1–5); this hook owns the assembly that
// runs on top of saved sections (steps 6–9). A single read —
// getFloorAssembly(floorId) — drives all four steps; the per-step POST/PUT
// calls then mutate the held draft state without extra round-trips.
//
// Presentational components consume this; all logic lives here (no canvas maths
// — that stays in controlPointCanvasCore — and no `any`).

import { useState, useCallback, useEffect } from 'react';
import { floorAssemblyApi } from '../api/floorAssemblyApi';
import { reconstructionApi } from '../api/apiService';
import { toastApi } from './useToast';
import { writeActivePoint } from '../lib/controlPoints';
import type {
  AssemblySection,
  BuildFloorPreviewResponse,
  Connector,
  ConnectorInput,
  FloorAssemblyResponse,
  MasterControlPoint,
  SolveTransformsResponse,
} from '../types/floorAssembly';

/** A connector being drawn/edited on the master canvas (local draft). */
export interface ConnectorDraft {
  /** Server id when the draft originated from a saved connector; absent for new. */
  id?: number;
  points: [number, number][];
}

export interface UseFloorAssemblyReturn {
  floorId: number | null;
  isLoading: boolean;
  error: string | null;

  // --- Single assembly read (drives all steps) ---
  assembly: FloorAssemblyResponse | null;
  masterSchemaUrl: string | null;
  pixelsPerMeter: number | null;
  meshFileGlb: string | null;
  sections: AssemblySection[];
  load: (floorId: number) => Promise<void>;
  reload: () => Promise<void>;

  // --- UC2: bind master control points ---
  activeSectionId: number | null;
  activePointId: string | null;
  /** Master points placed per section (draft, keyed by section id). */
  masterPointsBySection: Record<number, MasterControlPoint[]>;
  setActiveSection: (sectionId: number | null) => void;
  setActivePoint: (pointId: string | null) => void;
  /** Write the active id's master coord (active-id only, overwrite — AC2). */
  setMasterPoint: (sectionId: number, pointId: string, x: number, y: number) => void;
  removeMasterPoint: (sectionId: number, pointId: string) => void;
  /** Persist the active section's master points (PUT). */
  saveMasterControlPoints: (sectionId: number) => Promise<void>;
  /** Section-mask backdrop URLs (reconstruction preview), keyed by section id. */
  sectionThumbUrls: Record<number, string | null>;

  // --- UC3: solve transforms ---
  solveResult: SolveTransformsResponse | null;
  isSolving: boolean;
  solveTransforms: () => Promise<void>;

  // --- UC4: connectors ---
  connectorDrafts: ConnectorDraft[];
  setConnectorDrafts: (drafts: ConnectorDraft[]) => void;
  replaceConnectors: () => Promise<void>;
  isSavingConnectors: boolean;

  // --- UC5: build preview → confirm ---
  buildResult: BuildFloorPreviewResponse | null;
  previewGlbUrl: string | null;
  isBuilding: boolean;
  isConfirming: boolean;
  buildFloorMesh: () => Promise<void>;
  confirmFloorMesh: () => Promise<void>;
}

const connectorsToDrafts = (connectors: Connector[]): ConnectorDraft[] =>
  connectors.map((c) => ({ id: c.id, points: c.points }));

const draftsToInputs = (drafts: ConnectorDraft[]): ConnectorInput[] =>
  drafts.map((d) => ({ points: d.points }));

const masterPointsFromSections = (
  sections: AssemblySection[],
): Record<number, MasterControlPoint[]> => {
  const map: Record<number, MasterControlPoint[]> = {};
  for (const s of sections) {
    map[s.section_id] = s.master_control_points.map((p) => ({ ...p }));
  }
  return map;
};

export const useFloorAssembly = (): UseFloorAssemblyReturn => {
  const [floorId, setFloorId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assembly, setAssembly] = useState<FloorAssemblyResponse | null>(null);
  const [meshFileGlb, setMeshFileGlb] = useState<string | null>(null);
  const [pixelsPerMeter, setPixelsPerMeter] = useState<number | null>(null);

  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [masterPointsBySection, setMasterPointsBySection] = useState<
    Record<number, MasterControlPoint[]>
  >({});
  const [sectionThumbUrls, setSectionThumbUrls] = useState<
    Record<number, string | null>
  >({});

  const [solveResult, setSolveResult] = useState<SolveTransformsResponse | null>(null);
  const [isSolving, setIsSolving] = useState(false);

  const [connectorDrafts, setConnectorDrafts] = useState<ConnectorDraft[]>([]);
  const [isSavingConnectors, setIsSavingConnectors] = useState(false);

  const [buildResult, setBuildResult] = useState<BuildFloorPreviewResponse | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const load = useCallback(async (id: number): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await floorAssemblyApi.getFloorAssembly(id);
      setFloorId(id);
      setAssembly(data);
      setMeshFileGlb(data.mesh_file_glb);
      setPixelsPerMeter(data.pixels_per_meter);
      setMasterPointsBySection(masterPointsFromSections(data.sections));
      setConnectorDrafts(connectorsToDrafts(data.connectors));
      // Reset transient per-build state — those come from POSTs, never the read.
      setSolveResult(null);
      setBuildResult(null);
      // Default the active section to the first bound section, if any.
      const firstBound = data.sections.find((s) => s.reconstruction_id !== null);
      setActiveSectionId(firstBound ? firstBound.section_id : null);
      setActivePointId(null);

      // Fetch each bound section's mask preview for the bind thumbnail backdrop.
      const thumbs: Record<number, string | null> = {};
      await Promise.all(
        data.sections.map(async (s) => {
          if (s.reconstruction_id === null) {
            thumbs[s.section_id] = null;
            return;
          }
          try {
            const recon = await reconstructionApi.getReconstructionById(
              s.reconstruction_id,
            );
            thumbs[s.section_id] = recon.preview_url ?? recon.url ?? null;
          } catch {
            thumbs[s.section_id] = null;
          }
        }),
      );
      setSectionThumbUrls(thumbs);
    } catch {
      setError('Ошибка загрузки данных сборки этажа');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    if (floorId === null) return;
    await load(floorId);
  }, [floorId, load]);

  // --- UC2 -----------------------------------------------------------------
  const setActiveSection = useCallback((sectionId: number | null) => {
    setActiveSectionId(sectionId);
    setActivePointId(null);
  }, []);

  const setActivePoint = useCallback((pointId: string | null) => {
    setActivePointId(pointId);
  }, []);

  // Writes the master coord to the ACTIVE id only — no nearest-neighbour match.
  // Re-calling with the same id overwrites that id's coord (never duplicates).
  const setMasterPoint = useCallback(
    (sectionId: number, pointId: string, x: number, y: number) => {
      setMasterPointsBySection((prev) => ({
        ...prev,
        [sectionId]: writeActivePoint(prev[sectionId] ?? [], pointId, x, y),
      }));
    },
    [],
  );

  const removeMasterPoint = useCallback((sectionId: number, pointId: string) => {
    setMasterPointsBySection((prev) => {
      const current = prev[sectionId] ?? [];
      return { ...prev, [sectionId]: current.filter((p) => p.point_id !== pointId) };
    });
  }, []);

  const saveMasterControlPoints = useCallback(
    async (sectionId: number): Promise<void> => {
      if (floorId === null) return;
      setIsLoading(true);
      setError(null);
      try {
        const points = masterPointsBySection[sectionId] ?? [];
        const res = await floorAssemblyApi.saveMasterControlPoints(
          floorId,
          sectionId,
          points,
        );
        // Echo the server's canonical list back into the draft.
        setMasterPointsBySection((prev) => ({ ...prev, [sectionId]: res.points }));
        toastApi.success('Опорные точки сохранены');
      } catch {
        toastApi.error('Ошибка сохранения опорных точек');
      } finally {
        setIsLoading(false);
      }
    },
    [floorId, masterPointsBySection],
  );

  // --- UC3 -----------------------------------------------------------------
  const solveTransforms = useCallback(async (): Promise<void> => {
    if (floorId === null) return;
    setIsSolving(true);
    setError(null);
    try {
      const res = await floorAssemblyApi.solveTransforms(floorId);
      setSolveResult(res);
      setPixelsPerMeter(res.pixels_per_meter);
      const okCount = res.sections.filter((s) => s.status === 'ok').length;
      toastApi.success(`Преобразования рассчитаны (${okCount} OK)`);
    } catch {
      toastApi.error('Ошибка расчёта преобразований');
    } finally {
      setIsSolving(false);
    }
  }, [floorId]);

  // --- UC4 -----------------------------------------------------------------
  const replaceConnectors = useCallback(async (): Promise<void> => {
    if (floorId === null) return;
    setIsSavingConnectors(true);
    setError(null);
    try {
      const res = await floorAssemblyApi.replaceConnectors(
        floorId,
        draftsToInputs(connectorDrafts),
      );
      setConnectorDrafts(connectorsToDrafts(res.connectors));
      toastApi.success('Переходы сохранены');
    } catch {
      toastApi.error('Ошибка сохранения переходов');
    } finally {
      setIsSavingConnectors(false);
    }
  }, [floorId, connectorDrafts]);

  // --- UC5 -----------------------------------------------------------------
  const buildFloorMesh = useCallback(async (): Promise<void> => {
    if (floorId === null) return;
    setIsBuilding(true);
    setError(null);
    try {
      const res = await floorAssemblyApi.buildFloorMesh(floorId);
      setBuildResult(res);
      toastApi.success('Превью этажа построено');
    } catch {
      toastApi.error('Ошибка построения превью этажа');
    } finally {
      setIsBuilding(false);
    }
  }, [floorId]);

  const confirmFloorMesh = useCallback(async (): Promise<void> => {
    if (floorId === null || buildResult === null) return;
    setIsConfirming(true);
    setError(null);
    try {
      const res = await floorAssemblyApi.confirmFloorMesh(
        floorId,
        buildResult.glb_file_id,
      );
      setMeshFileGlb(res.mesh_file_glb);
      toastApi.success('Этаж сохранён');
    } catch {
      toastApi.error('Ошибка сохранения этажа');
    } finally {
      setIsConfirming(false);
    }
  }, [floorId, buildResult]);

  // Revoke nothing here: preview/section URLs are server URLs (not blob:),
  // produced by the API; they need no manual cleanup.
  useEffect(() => {
    return () => {
      /* no blob URLs created in this hook */
    };
  }, []);

  return {
    floorId,
    isLoading,
    error,
    assembly,
    masterSchemaUrl: assembly?.master_schema.url ?? null,
    pixelsPerMeter,
    meshFileGlb,
    sections: assembly?.sections ?? [],
    load,
    reload,
    activeSectionId,
    activePointId,
    masterPointsBySection,
    setActiveSection,
    setActivePoint,
    setMasterPoint,
    removeMasterPoint,
    saveMasterControlPoints,
    sectionThumbUrls,
    solveResult,
    isSolving,
    solveTransforms,
    connectorDrafts,
    setConnectorDrafts,
    replaceConnectors,
    isSavingConnectors,
    buildResult,
    previewGlbUrl: buildResult?.glb_url ?? null,
    isBuilding,
    isConfirming,
    buildFloorMesh,
    confirmFloorMesh,
  };
};
