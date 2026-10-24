import api, { getErrorMessage } from './api';
import type { User, AuthTokens, LoginRequest, RegisterRequest } from '../types';

export const authService = {
  async login(data: LoginRequest): Promise<AuthTokens> {
    const res = await api.post<AuthTokens>('/api/auth/login', data);
    const tokens = res.data;
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    return tokens;
  },

  async register(data: RegisterRequest): Promise<User> {
    const res = await api.post<User>('/api/auth/register', data);
    return res.data;
  },

  async me(): Promise<User> {
    const res = await api.get<User>('/api/auth/me');
    return res.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  },
};
