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

  async getReportSummary(params?: { from_date?: string; to_date?: string }) {
    const res = await api.get('/api/reports/summary', { params });
    return res.data;
  },

  async exportClaimsCsv(params?: {
    status?: string;
    incident_type?: string;
    risk_level?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<Blob> {
    const res = await api.get('/api/reports/claims/export-csv', {
      params,
      responseType: 'blob',
    });
    return res.data;
  },

  async exportSettlementsCsv(params?: {
    status?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<Blob> {
    const res = await api.get('/api/reports/settlements/export-csv', {
      params,
      responseType: 'blob',
    });
    return res.data;
  },
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
