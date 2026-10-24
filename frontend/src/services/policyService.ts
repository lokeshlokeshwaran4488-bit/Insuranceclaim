import api from './api';
import type { Policy } from '../types';

interface PaginatedPolicies {
  policies: Policy[];
  total: number;
  page: number;
  page_size: number;
}

export const policyService = {
  async listPolicies(filters?: { page?: number; page_size?: number; status?: string }): Promise<PaginatedPolicies> {
    const res = await api.get<PaginatedPolicies>('/api/policies', { params: filters });
    return res.data;
  },

  async getPolicy(id: string): Promise<Policy> {
    const res = await api.get<Policy>(`/api/policies/${id}`);
    return res.data;
  },

  async createPolicy(data: Partial<Policy>): Promise<Policy> {
    const res = await api.post<Policy>('/api/policies', data);
    return res.data;
  },

  async updatePolicy(id: string, data: Partial<Policy>): Promise<Policy> {
    const res = await api.put<Policy>(`/api/policies/${id}`, data);
    return res.data;
  },

  async deletePolicy(id: string): Promise<void> {
    await api.delete(`/api/policies/${id}`);
  },
};
