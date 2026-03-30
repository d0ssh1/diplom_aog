import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StitchingState, LayerData, StitchingRequest } from '../types/stitching';
import { reconstructionApi } from '../api/apiService';

interface UseStitchingReturn {
  state: StitchingState;
  loadReconstructions: (buildingId: string, floorNumber: number) => Promise<void>;
  selectPlans: (ids: string[], buildingId: string, floorNumber: number) => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
  updateLayer: (layerId: string, updates: Partial<LayerData>) => void;
  setActiveTool: (tool: 'move' | 'rotate' | 'rect_crop' | 'polygon_clip') => void;
  setSelectedLayerId: (id: string | null) => void;
  restoreCanvasFromSnapshot: (snapshot: unknown) => void;
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

  const selectPlans = useCallback(async (ids: string[], buildingId: string, floorNumber: number) => {
    setState((prev) => ({
      ...prev,
      selectedReconstructionIds: ids,
      buildingId,
      floorNumber,
      isLoading: true,
      error: null,
    }));

    try {
      // Fetch full reconstruction data for each selected ID
      const reconstructions = await Promise.all(
        ids.map(async (id) => {
          const numId = Number(id);
          const rec = await reconstructionApi.getReconstructionById(numId);
          try {
            const vectors = await reconstructionApi.getReconstructionVectors(numId);
            return { ...rec, vector_model: vectors };
          } catch (error) {
            console.error(`Failed to load vectors for reconstruction ${id}:`, error);
            return { ...rec, vector_model: { walls: [], rooms: [], doors: [] } };
          }
        })
      );

      // Convert to LayerData format
      const colors = ['#FF4500', '#00CED1', '#FFD700', '#FF69B4', '#32CD32'];
      const layers: LayerData[] = reconstructions.map((rec, index) => ({
        reconstructionId: String(rec.id),
        name: rec.name || `План ${index + 1}`,
        imageUrl: rec.preview_url || rec.original_image_url,
        vectorModel: rec.vector_model || { walls: [], rooms: [], doors: [] },
        transform: {
          translate_x: index * 50,
          translate_y: index * 50,
          scale_x: 1,
          scale_y: 1,
          rotation_deg: rec.vector_model?.rotation_angle ?? 0,
        },
        clipPolygons: [],
        rectCrop: null,
        imageWidth: rec.image_width || 1000,
        imageHeight: rec.image_height || 1000,
        zIndex: index,
        color: colors[index % colors.length],
        maskOpacity: 0.7,
        showMask: true,
      }));

      setState((prev) => ({
        ...prev,
        layers,
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: String(error),
      }));
      throw error;
    }
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

  const restoreCanvasFromSnapshot = useCallback((_snapshot: unknown) => {
    return;
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
    restoreCanvasFromSnapshot,
    submitStitching,
  };
};
