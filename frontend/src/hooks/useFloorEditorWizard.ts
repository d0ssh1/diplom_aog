// State machine for the multi-step floor editor wizard.
// See docs/features/building-hierarchy/plan/phase-08.md §useFloorEditorWizard

import { useState, useCallback } from 'react';
import { floorsApi, sectionsApi } from '../api/buildingsApi';
import { floorSchemaApi } from '../api/floorSchemaApi';
import type {
  CropBbox,
  SectionGeometry,
  ReconstructionBrief,
  ReplaceSectionsRequest,
} from '../types/hierarchy';

export type EditorMode = 'wizard' | 'overview' | 'table';
export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface Point2D {
  x: number;
  y: number;
}

export interface SectionDraft {
  /** Present when the draft originated from a saved section */
  id?: number;
  number: number;
  geometry: SectionGeometry;
  section_type: number;
  reconstruction_id: number | null;
  /** Populated for UI display purposes only */
  reconstruction_brief?: ReconstructionBrief;
}

interface UseFloorEditorWizardReturn {
  mode: EditorMode;
  currentStep: WizardStep;
  floorId: number | null;
  schemaImageId: string | null;
  schemaImageUrl: string | null;
  cropBbox: CropBbox | null;
  wallPolygons: Point2D[][] | null;
  sectionDrafts: SectionDraft[];
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;

  loadFor: (floorId: number) => Promise<void>;
  setMode: (mode: EditorMode) => void;
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Wizard data setters
  setSchemaImage: (fileId: string, url: string) => Promise<void>;
  setCropBbox: (bbox: CropBbox) => void;
  commitCropBbox: () => Promise<void>;
  triggerWallExtraction: () => Promise<void>;
  setWallPolygons: (polygons: Point2D[][]) => void;
  commitWallPolygons: () => Promise<void>;

  // Section management
  addSectionDraft: (geometry: SectionGeometry, number: number) => void;
  updateSectionDraft: (idx: number, partial: Partial<SectionDraft>) => void;
  deleteSectionDraft: (idx: number) => void;
  bindReconstruction: (sectionIdx: number, reconstructionId: number | null) => void;
  saveAll: () => Promise<void>;
}

function normalizeToPoint2D(polygons: [number, number][][]): Point2D[][] {
  return polygons.map((poly) => poly.map(([x, y]) => ({ x, y })));
}

export const useFloorEditorWizard = (): UseFloorEditorWizardReturn => {
  const [mode, setModeState] = useState<EditorMode>('wizard');
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [floorId, setFloorId] = useState<number | null>(null);
  const [schemaImageId, setSchemaImageId] = useState<string | null>(null);
  const [schemaImageUrl, setSchemaImageUrl] = useState<string | null>(null);
  const [cropBbox, setCropBboxState] = useState<CropBbox | null>(null);
  const [wallPolygons, setWallPolygonsState] = useState<Point2D[][] | null>(null);
  const [sectionDrafts, setSectionDrafts] = useState<SectionDraft[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFor = useCallback(async (id: number): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const [floor, sections] = await Promise.all([
        floorsApi.getById(id),
        sectionsApi.listByFloor(id),
      ]);

      setFloorId(id);
      setSchemaImageId(floor.schema_image_id);
      setSchemaImageUrl(floor.schema_image_url);
      setCropBboxState(floor.schema_crop_bbox);
      setWallPolygonsState(
        floor.wall_polygons ? normalizeToPoint2D(floor.wall_polygons) : null,
      );

      const drafts: SectionDraft[] = sections.map((s) => ({
        id: s.id,
        number: s.number,
        geometry: s.geometry,
        section_type: s.section_type,
        reconstruction_id: s.reconstruction?.id ?? null,
        reconstruction_brief: s.reconstruction ?? undefined,
      }));
      setSectionDrafts(drafts);
      setIsDirty(false);

      // Always start the wizard at step 1 (upload) so the admin sees the full
      // sequence: upload → crop → walls → sections. If saved data exists, each
      // step shows it as preview and "Далее" skips re-processing.
      // If sections are already saved, show overview by default — admin can hit
      // "Редактировать" to re-enter wizard from step 1.
      if (sections.length > 0) {
        setModeState('overview');
      } else {
        setModeState('wizard');
        setCurrentStep(1);
      }
    } catch {
      setError('Ошибка загрузки этажа');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setMode = useCallback((m: EditorMode) => {
    setModeState(m);
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
    setModeState('wizard');
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((s) => (Math.min(s + 1, 5) as WizardStep));
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => (Math.max(s - 1, 1) as WizardStep));
  }, []);

  const setSchemaImage = useCallback(
    async (fileId: string, url: string): Promise<void> => {
      if (floorId === null) return;
      setIsLoading(true);
      setError(null);
      try {
        await floorSchemaApi.uploadSchema(floorId, {
          schema_image_id: fileId,
          schema_crop_bbox: null,
        });
        setSchemaImageId(fileId);
        setSchemaImageUrl(url);
        setCropBboxState(null);
      } catch {
        setError('Ошибка загрузки схемы');
        throw new Error('Ошибка загрузки схемы');
      } finally {
        setIsLoading(false);
      }
    },
    [floorId],
  );

  const setCropBbox = useCallback((bbox: CropBbox) => {
    setCropBboxState(bbox);
    setIsDirty(true);
  }, []);

  const commitCropBbox = useCallback(async (): Promise<void> => {
    if (floorId === null || schemaImageId === null) return;
    setIsLoading(true);
    setError(null);
    try {
      await floorSchemaApi.uploadSchema(floorId, {
        schema_image_id: schemaImageId,
        schema_crop_bbox: cropBbox,
      });
      setIsDirty(false);
    } catch {
      setError('Ошибка сохранения кропа');
      throw new Error('Ошибка сохранения кропа');
    } finally {
      setIsLoading(false);
    }
  }, [floorId, schemaImageId, cropBbox]);

  const triggerWallExtraction = useCallback(async (): Promise<void> => {
    if (floorId === null) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await floorSchemaApi.extractWalls(floorId);
      setWallPolygonsState(normalizeToPoint2D(result.wall_polygons));
    } catch {
      setError('Ошибка извлечения стен');
      throw new Error('Ошибка извлечения стен');
    } finally {
      setIsLoading(false);
    }
  }, [floorId]);

  const setWallPolygons = useCallback((polygons: Point2D[][]) => {
    setWallPolygonsState(polygons);
    setIsDirty(true);
  }, []);

  const commitWallPolygons = useCallback(async (): Promise<void> => {
    if (floorId === null || wallPolygons === null) return;
    setIsLoading(true);
    setError(null);
    try {
      const raw: [number, number][][] = wallPolygons.map((poly) =>
        poly.map((pt) => [pt.x, pt.y] as [number, number]),
      );
      await floorSchemaApi.updateWalls(floorId, raw);
      setIsDirty(false);
    } catch {
      setError('Ошибка сохранения стен');
      throw new Error('Ошибка сохранения стен');
    } finally {
      setIsLoading(false);
    }
  }, [floorId, wallPolygons]);

  const addSectionDraft = useCallback(
    (geometry: SectionGeometry, number: number) => {
      setSectionDrafts((prev) => [
        ...prev,
        { number, geometry, section_type: 1, reconstruction_id: null },
      ]);
      setIsDirty(true);
    },
    [],
  );

  const updateSectionDraft = useCallback(
    (idx: number, partial: Partial<SectionDraft>) => {
      setSectionDrafts((prev) =>
        prev.map((d, i) => (i === idx ? { ...d, ...partial } : d)),
      );
      setIsDirty(true);
    },
    [],
  );

  const deleteSectionDraft = useCallback((idx: number) => {
    setSectionDrafts((prev) => prev.filter((_, i) => i !== idx));
    setIsDirty(true);
  }, []);

  const bindReconstruction = useCallback(
    (sectionIdx: number, reconstructionId: number | null) => {
      setSectionDrafts((prev) =>
        prev.map((d, i) =>
          i === sectionIdx ? { ...d, reconstruction_id: reconstructionId } : d,
        ),
      );
      setIsDirty(true);
    },
    [],
  );

  const saveAll = useCallback(async (): Promise<void> => {
    if (floorId === null) return;
    setIsLoading(true);
    setError(null);
    try {
      const req: ReplaceSectionsRequest = {
        sections: sectionDrafts.map((d) => ({
          number: d.number,
          geometry: d.geometry,
          section_type: d.section_type,
          reconstruction_id: d.reconstruction_id,
        })),
      };
      const saved = await sectionsApi.replace(floorId, req);
      const updatedDrafts: SectionDraft[] = saved.map((s) => ({
        id: s.id,
        number: s.number,
        geometry: s.geometry,
        section_type: s.section_type,
        reconstruction_id: s.reconstruction?.id ?? null,
        reconstruction_brief: s.reconstruction ?? undefined,
      }));
      setSectionDrafts(updatedDrafts);
      setIsDirty(false);
      setModeState('overview');
    } catch {
      setError('Ошибка сохранения секций');
      throw new Error('Ошибка сохранения секций');
    } finally {
      setIsLoading(false);
    }
  }, [floorId, sectionDrafts]);

  return {
    mode,
    currentStep,
    floorId,
    schemaImageId,
    schemaImageUrl,
    cropBbox,
    wallPolygons,
    sectionDrafts,
    isDirty,
    isLoading,
    error,
    loadFor,
    setMode,
    goToStep,
    nextStep,
    prevStep,
    setSchemaImage,
    setCropBbox,
    commitCropBbox,
    triggerWallExtraction,
    setWallPolygons,
    commitWallPolygons,
    addSectionDraft,
    updateSectionDraft,
    deleteSectionDraft,
    bindReconstruction,
    saveAll,
  };
};
