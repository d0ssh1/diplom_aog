import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StitchingState, LayerData, StitchingRequest } from '../types/stitching';
import { reconstructionApi } from '../api/apiService';

interface UseStitchingReturn {
  state: StitchingState;
  loadReconstructions: (buildingId: string, floorNumber: number) => Promise<void>;
  selectPlans: (ids: string[], buildingId: string, floorNumber: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateLayer: (layerId: string, updates: Partial<LayerData>) => void;
  setActiveTool: (tool: 'move' | 'rotate' | 'rect_crop' | 'polygon_clip') => void;
  setSelectedLayerId: (id: string | null) => void;
  submitStitching: (name: string) => Promise<void>;
}

export const useStitching = (): UseStitchingReturn => {
  const navigate = useNavigate();
  const [state, setState] = useState<StitchingState>({
    step: 1,
    selectedReconstructionIds: [],
    buildingId: '',
    floorNumber: 1,
    layers: [],
    activeTool: 'move',
    selectedLayerId: null,
    isLoading: false,
    error: null,
  });

  const loadReconstructions = useCallback(async (buildingId: string, floorNumber: number) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const reconstructions = await reconstructionApi.getReadyReconstructions(buildingId, floorNumber);
      setState((prev) => ({ ...prev, isLoading: false }));
      return reconstructions;
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false, error: String(error) }));
      throw error;
    }
  }, []);

  const selectPlans = useCallback((ids: string[], buildingId: string, floorNumber: number) => {
    setState((prev) => ({
      ...prev,
      selectedReconstructionIds: ids,
      buildingId,
      floorNumber,
    }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => ({ ...prev, step: 2 as 1 | 2 }));
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({ ...prev, step: 1 as 1 | 2 }));
  }, []);

  const updateLayer = useCallback((layerId: string, updates: Partial<LayerData>) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        layer.reconstructionId === layerId ? { ...layer, ...updates } : layer
      ),
    }));
  }, []);

  const setActiveTool = useCallback((tool: 'move' | 'rotate' | 'rect_crop' | 'polygon_clip') => {
    setState((prev) => ({ ...prev, activeTool: tool }));
  }, []);

  const setSelectedLayerId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, selectedLayerId: id }));
  }, []);

  const submitStitching = useCallback(async (name: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const request: StitchingRequest = {
        name,
        building_id: state.buildingId,
        floor_number: state.floorNumber,
        source_plans: state.layers.map((layer) => ({
          reconstruction_id: layer.reconstructionId,
          transform: layer.transform,
          clip_polygons: layer.clipPolygons,
          rect_crop: layer.rectCrop,
          image_width_px: layer.imageWidth,
          image_height_px: layer.imageHeight,
          z_index: layer.zIndex,
        })),
      };

      const response = await reconstructionApi.postStitching(request);

      navigate(`/admin/mesh/${response.id}`);
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false, error: String(error) }));
      throw error;
    }
  }, [state, navigate]);

  return {
    state,
    loadReconstructions,
    selectPlans,
    nextStep,
    prevStep,
    updateLayer,
    setActiveTool,
    setSelectedLayerId,
    submitStitching,
  };
};
