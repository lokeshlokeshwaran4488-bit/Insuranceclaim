import api from './api';
import type { DashboardStats, ClaimsAnalytics } from '../types';

export const analyticsService = {
  async getDashboardStats(): Promise<DashboardStats> {
    const res = await api.get<DashboardStats>('/api/admin/analytics/dashboard');
    return res.data;
  },

  async getClaimsAnalytics(): Promise<ClaimsAnalytics> {
    const res = await api.get<ClaimsAnalytics>('/api/admin/analytics/claims');
    return res.data;
  },

  async getFraudAnalytics() {
    const res = await api.get('/api/admin/analytics/fraud');
    return res.data;
  },

  async getSettlementAnalytics() {
    const res = await api.get('/api/admin/analytics/settlements');
    return res.data;
  },

  async getAuditLogs(params?: { page?: number; page_size?: number; action?: string; entity_type?: string }) {
    const res = await api.get('/api/admin/audit-logs', { params });
    return res.data;
  },
};
