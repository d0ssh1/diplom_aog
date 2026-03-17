export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface UploadedFile {
  id: string;
  url: string;
  name: string;
}

export interface WizardState {
  step: WizardStep;
  planFileId: string | null;
  planUrl: string | null;
  maskFileId: string | null;
  reconstructionId: number | null;
  meshUrl: string | null;
  cropRect: CropRect | null;
  rotation: 0 | 90 | 180 | 270;
  isLoading: boolean;
  error: string | null;
}
