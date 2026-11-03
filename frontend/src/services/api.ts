import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// ─── Active Production Backend URL ───────────────────────────────────────────
const PRODUCTION_BACKEND_URL = 'https://insureclaim-backend-swc9.onrender.com';

const isProd = import.meta.env.PROD;
const defaultBaseUrl = isProd ? PRODUCTION_BACKEND_URL : 'http://localhost:5000';

let rawBaseUrl = (import.meta.env.VITE_API_URL || defaultBaseUrl).trim();

// Automatically sanitize any deprecated or stale backend URLs
if (
  rawBaseUrl.includes('insuranceclaim-m0ij.onrender.com') ||
  rawBaseUrl.includes('insureclaim-backend.onrender.com') ||
  rawBaseUrl === 'insureclaim-backend'
) {
  rawBaseUrl = PRODUCTION_BACKEND_URL;
}

if (rawBaseUrl && !rawBaseUrl.startsWith('http://') && !rawBaseUrl.startsWith('https://')) {
  rawBaseUrl = `https://${rawBaseUrl}`;
}
export const BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

// ─── Secure WebSocket URL Helper ──────────────────────────────────────────────
export const getWebSocketUrl = (userId?: string): string => {
  const wsProtocol = BASE_URL.startsWith('https://') ? 'wss://' : 'ws://';
  const host = BASE_URL.replace(/^https?:\/\//, '');
  const token = localStorage.getItem('access_token');
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  const path = userId ? `/ws/${userId}` : '/ws';
  return `${wsProtocol}${host}${path}${tokenParam}`;
};

// ─── Axios Instance ──────────────────────────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor: Attach JWT ─────────────────────────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: Handle 401 + Token Refresh ────────────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${BASE_URL}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token: newRefresh } = res.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', newRefresh);
        api.defaults.headers.common.Authorization = `Bearer ${access_token}`;
        processQueue(null, access_token);
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Error Message Extractor ──────────────────────────────────────────────────
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join(', ');
    if (error.response?.status === 401) return 'Invalid email or password.';
    if (error.response?.status === 403) return 'Access denied. You do not have permission for this action.';
    if (error.response?.status === 404) return 'Requested endpoint or resource not found.';
    if (error.response?.status === 503) return 'Service temporarily unavailable. Please try again.';
    if (error.response?.status === 500) return 'Server error. Please try again.';
    if (error.message === 'Network Error') return 'Cannot connect to server. Please check your connection.';
  }
  return 'An unexpected error occurred.';
};

export default api;
