/**
 * API клиент для взаимодействия с backend
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

const API_BASE_URL = '/api/v1';

// Создание инстанса axios
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor для добавления токена
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor для обработки ошибок
// Interceptor для обработки ошибок
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// === Auth API ===

export const authApi = {
  login: async (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    
    const response = await apiClient.post('/token/login/', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },

  register: async (data: any) => {
      const response = await apiClient.post('/users/', data);
      return response.data;
  },
  
  logout: async () => {
    await apiClient.post('/token/logout/');
    localStorage.removeItem('auth_token');
  },
  
  getMe: async () => {
    const response = await apiClient.get('/users/me/');
    return response.data;
  },
};

// === Upload API ===

export const uploadApi = {
  uploadPlanPhoto: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/upload/plan-photo/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  
  uploadUserMask: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/upload/user-mask/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

// === Reconstruction API ===

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CalculateMaskResponse {
  file_id: string;
}

export const reconstructionApi = {
  calculateMask: async (fileId: string, crop?: CropRect, rotation?: number, blockSize?: number, thresholdC?: number) => {
    const cropData = crop ? { x: crop.x, y: crop.y, width: crop.width, height: crop.height } : null;
    const { data } = await apiClient.post<CalculateMaskResponse>('/reconstruction/initial-masks', {
      file_id: fileId,
      crop: cropData,
      rotation: rotation ?? 0,
      block_size: blockSize ?? 15,
      threshold_c: thresholdC ?? 10,
    });
    return data;
  },

  previewMask: async (fileId: string, crop?: CropRect | null, rotation?: number, blockSize?: number, thresholdC?: number): Promise<string> => {
    const cropData = crop ? { x: crop.x, y: crop.y, width: crop.width, height: crop.height } : null;
    const response = await apiClient.post(
      '/reconstruction/mask-preview',
      {
        file_id: fileId,
        crop: cropData,
        rotation: rotation ?? 0,
        block_size: blockSize ?? 15,
        threshold_c: thresholdC ?? 10,
      },
      { responseType: 'blob' },
    );
    return URL.createObjectURL(response.data);
  },
  
  calculateHough: async (planFileId: string, maskFileId: string) => {
    const response = await apiClient.post('/reconstruction/houghs', {
      plan_file_id: planFileId,
      user_mask_file_id: maskFileId,
    });
    return response.data;
  },
  
  calculateMesh: async (planFileId: string, maskFileId: string) => {
    const response = await apiClient.post('/reconstruction/reconstructions', {
      plan_file_id: planFileId,
      user_mask_file_id: maskFileId,
    });
    return response.data;
  },
  
  getReconstructionById: async (id: number) => {
    const response = await apiClient.get(`/reconstruction/reconstructions/${id}`);
    return response.data;
  },
  
  getReconstructions: async () => {
    const response = await apiClient.get('/reconstruction/reconstructions');
    return response.data;
  },
  
  saveReconstruction: async (id: number, name: string) => {
    const response = await apiClient.put(`/reconstruction/reconstructions/${id}/save`, { name });
    return response.data;
  },
  
  deleteReconstruction: async (id: number) => {
    await apiClient.delete(`/reconstruction/reconstructions/${id}`);
  },
  
  saveRooms: async (id: number, rooms: Array<{ number: string; x: number; y: number }>) => {
    await apiClient.put(`/reconstruction/reconstructions/${id}/rooms`, { rooms });
  },
};

// === Navigation API ===

export const navigationApi = {
  buildRoute: async (startPoint: string, endPoint: string) => {
    const response = await apiClient.post('/navigation/route', {
      start_point: startPoint,
      end_point: endPoint,
    });
    return response.data;
  },
};

export default apiClient;
