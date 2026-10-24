import api from './api';
import type { Settlement } from '../types';

interface PaginatedSettlements {
  settlements: Settlement[];
  total: number;
  page: number;
  page_size: number;
}

export const settlementService = {
  async listSettlements(params?: { page?: number; page_size?: number; payment_status?: string }): Promise<PaginatedSettlements> {
    const res = await api.get<PaginatedSettlements>('/api/settlements', { params });
    return res.data;
  },

  async getSettlement(id: string): Promise<Settlement> {
    const res = await api.get<Settlement>(`/api/settlements/${id}`);
    return res.data;
  },

  async createSettlement(data: { claim_id: string; payment_amount: number; payment_method: string; bank_account?: string }): Promise<Settlement> {
    const res = await api.post<Settlement>('/api/settlements', data);
    return res.data;
  },

  async updateSettlement(id: string, data: Partial<Settlement>): Promise<Settlement> {
    const res = await api.put<Settlement>(`/api/settlements/${id}`, data);
    return res.data;
  },

  async getEligibleClaims(): Promise<any[]> {
    const res = await api.get<any[]>('/api/settlements/eligible-claims');
    return res.data;
  },

  async completeSettlement(id: string): Promise<Settlement> {
    const res = await api.post<Settlement>(`/api/settlements/${id}/complete`);
    return res.data;
  },
};
