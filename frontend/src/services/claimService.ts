import api from './api';
import type { Claim, ClaimTimeline, CreateClaimRequest, ApproveClaimRequest, RejectClaimRequest } from '../types';

interface PaginatedClaims {
  claims: Claim[];
  total: number;
  page: number;
  page_size: number;
}

interface ClaimFilters {
  page?: number;
  page_size?: number;
  status?: string;
  incident_type?: string;
  risk_level?: string;
  search?: string;
}

export const claimService = {
  async createClaim(data: CreateClaimRequest): Promise<Claim> {
    const res = await api.post<Claim>('/api/claims', data);
    return res.data;
  },

  async listClaims(filters?: ClaimFilters): Promise<PaginatedClaims> {
    const res = await api.get<PaginatedClaims>('/api/claims', { params: filters });
    return res.data;
  },

  async getClaim(id: string): Promise<Claim> {
    const res = await api.get<Claim>(`/api/claims/${id}`);
    return res.data;
  },

  async updateClaim(id: string, data: Partial<CreateClaimRequest>): Promise<Claim> {
    const res = await api.put<Claim>(`/api/claims/${id}`, data);
    return res.data;
  },

  async submitClaim(id: string): Promise<Claim> {
    const res = await api.post<Claim>(`/api/claims/${id}/submit`);
    return res.data;
  },

  async deleteClaim(id: string): Promise<void> {
    await api.delete(`/api/claims/${id}`);
  },

  async getTimeline(id: string): Promise<ClaimTimeline[]> {
    const res = await api.get<ClaimTimeline[]>(`/api/claims/${id}/timeline`);
    return res.data;
  },

  async assignOfficer(claimId: string, officerId: string): Promise<Claim> {
    const res = await api.post<Claim>(`/api/claims/${claimId}/assign`, { officer_id: officerId });
    return res.data;
  },

  async startReview(claimId: string): Promise<Claim> {
    const res = await api.post<Claim>(`/api/claims/${claimId}/start-review`);
    return res.data;
  },

  async requestDocuments(claimId: string, documentTypes: string[], message: string, deadlineDays?: number): Promise<Claim> {
    const res = await api.post<Claim>(`/api/claims/${claimId}/request-documents`, {
      document_types: documentTypes,
      message,
      deadline_days: deadlineDays,
    });
    return res.data;
  },

  async getDocumentRequests(claimId: string): Promise<any[]> {
    const res = await api.get<any[]>(`/api/claims/${claimId}/document-requests`);
    return res.data;
  },

  async addClaimNote(claimId: string, remarks: string, isInternal: boolean = true): Promise<any> {
    const res = await api.post<any>(`/api/claims/${claimId}/notes`, {
      remarks,
      is_internal: isInternal,
    });
    return res.data;
  },

  async getClaimReviews(claimId: string): Promise<any[]> {
    const res = await api.get<any[]>(`/api/claims/${claimId}/reviews`);
    return res.data;
  },

  async getAiAnalysis(claimId: string): Promise<any> {
    const res = await api.get<any>(`/api/claims/${claimId}/ai-analysis`);
    return res.data;
  },

  async runAiAssessment(claimId: string): Promise<any> {
    const res = await api.post<any>('/api/ai/claim-summary', { claim_id: claimId });
    return res.data;
  },

  async getFraudScore(claimId: string): Promise<any> {
    const res = await api.get<any>(`/api/claims/${claimId}/fraud-score`);
    return res.data;
  },

  async recalculateRiskScore(claimId: string): Promise<any> {
    const res = await api.post<any>('/api/ai/fraud-score', { claim_id: claimId });
    return res.data;
  },

  async recommendApproval(claimId: string, remarks: string, recommendedAmount?: number): Promise<Claim> {
    const res = await api.post<Claim>(`/api/claims/${claimId}/recommend-approval`, {
      remarks,
      recommended_amount: recommendedAmount,
    });
    return res.data;
  },

  async recommendRejection(claimId: string, remarks: string, rejectionReason: string): Promise<Claim> {
    const res = await api.post<Claim>(`/api/claims/${claimId}/recommend-rejection`, {
      remarks,
      rejection_reason: rejectionReason,
    });
    return res.data;
  },

  async escalateClaim(claimId: string, remarks: string): Promise<Claim> {
    const res = await api.post<Claim>(`/api/claims/${claimId}/escalate`, { remarks });
    return res.data;
  },

  async approveClaim(claimId: string, data: ApproveClaimRequest): Promise<Claim> {
    const res = await api.post<Claim>(`/api/claims/${claimId}/approve`, data);
    return res.data;
  },

  async rejectClaim(claimId: string, data: RejectClaimRequest): Promise<Claim> {
    const res = await api.post<Claim>(`/api/claims/${claimId}/reject`, data);
    return res.data;
  },
};
