import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { reconstructionApi, uploadApi } from '../api/apiService';
import type { WizardState, CropRect, RoomAnnotation, DoorAnnotation } from '../types/wizard';

interface UseWizardReturn {
  state: WizardState;
  nextStep: () => void;
  prevStep: () => void;
  setPlanFile: (id: string, url: string) => void;
  calculateMask: () => Promise<void>;
  setMaskFile: (id: string) => void;
  saveMaskAndAnnotations: (blob: Blob, rooms: RoomAnnotation[], doors: DoorAnnotation[]) => Promise<void>;
  buildMesh: () => Promise<void>;
  save: (name: string) => Promise<void>;
  setCropRect: (rect: CropRect | null) => void;
  setRotation: (deg: 0 | 90 | 180 | 270) => void;
}

const initialState: WizardState = {
  step: 1,
  planFileId: null,
  planUrl: null,
  maskFileId: null,
  editedMaskFileId: null,
  reconstructionId: null,
  meshUrl: null,
  cropRect: null,
  rotation: 0,
  rooms: [],
  doors: [],
  isLoading: false,
  error: null,
};

export const useWizard = (): UseWizardReturn => {
  const [state, setState] = useState<WizardState>(initialState);
  const navigate = useNavigate();

  const nextStep = useCallback(() => {
    setState((s) => ({ ...s, step: Math.min(s.step + 1, 6) as WizardState['step'] }));
  }, []);

  const prevStep = useCallback(() => {
    setState((s) => ({ ...s, step: Math.max(s.step - 1, 1) as WizardState['step'] }));
  }, []);

  const setPlanFile = useCallback((id: string, url: string) => {
    setState((s) => ({ ...s, planFileId: id, planUrl: url }));
  }, []);

  const setCropRect = useCallback((rect: CropRect | null) => {
    setState((s) => ({ ...s, cropRect: rect }));
  }, []);

  const setRotation = useCallback((deg: 0 | 90 | 180 | 270) => {
    setState((s) => ({ ...s, rotation: deg }));
  }, []);

  const setMaskFile = useCallback((id: string) => {
    setState((s) => ({ ...s, maskFileId: id }));
  }, []);

  const saveMaskAndAnnotations = useCallback(async (blob: Blob, rooms: RoomAnnotation[], doors: DoorAnnotation[]) => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const file = new File([blob], 'mask.png', { type: 'image/png' });
      const data = await uploadApi.uploadUserMask(file);
      setState((s) => ({ ...s, editedMaskFileId: String(data.id ?? data.file_id ?? ''), rooms, doors, isLoading: false }));
    } catch {
      setState((s) => ({ ...s, isLoading: false, error: 'Ошибка сохранения маски' }));
    }
  }, []);

  const calculateMask = useCallback(async () => {
    if (!state.planFileId) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await reconstructionApi.calculateMask(
        state.planFileId,
        state.cropRect ?? undefined,
        state.rotation,
      );
      const raw = data as unknown as Record<string, unknown>;
      const fileId = raw.file_id ?? raw.id ?? raw.mask_file_id ?? '';
      setState((s) => ({ ...s, maskFileId: String(fileId), isLoading: false }));
    } catch {
      setState((s) => ({ ...s, isLoading: false, error: 'Ошибка вычисления маски' }));
    }
  }, [state.planFileId, state.cropRect, state.rotation]);

  const buildMesh = useCallback(async () => {
    if (!state.planFileId || !state.maskFileId) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await reconstructionApi.calculateMesh(state.planFileId, state.maskFileId);
      const detail = await reconstructionApi.getReconstructionById(data.id as number);
      setState((s) => ({
        ...s,
        reconstructionId: data.id as number,
        meshUrl: detail.url as string | null,
        isLoading: false,
        step: 4,
      }));
    } catch {
      setState((s) => ({ ...s, isLoading: false, error: 'Ошибка построения 3D-модели' }));
    }
  }, [state.planFileId, state.maskFileId]);

  const save = useCallback(
    async (name: string) => {
      if (!state.reconstructionId) return;
      setState((s) => ({ ...s, isLoading: true, error: null }));
      try {
        await reconstructionApi.saveReconstruction(state.reconstructionId, name);
        navigate('/');
      } catch {
        setState((s) => ({ ...s, isLoading: false, error: 'Ошибка сохранения' }));
      }
    },
    [state.reconstructionId, navigate],
  );

  return {
    state,
    nextStep,
    prevStep,
    setPlanFile,
    calculateMask,
    setMaskFile,
    saveMaskAndAnnotations,
    buildMesh,
    save,
    setCropRect,
    setRotation,
  };
};
