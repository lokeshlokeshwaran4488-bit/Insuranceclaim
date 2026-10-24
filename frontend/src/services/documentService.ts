import api from './api';
import type { ClaimDocument } from '../types';

export interface DocumentListResponse {
  documents: ClaimDocument[];
  total: number;
}

export const documentService = {
  async uploadDocument(claimId: string, file: File, documentCategory: string): Promise<ClaimDocument> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_category', documentCategory);

    const res = await api.post<ClaimDocument>(`/api/claims/${claimId}/documents`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  async listDocuments(claimId: string): Promise<DocumentListResponse> {
    const res = await api.get<DocumentListResponse>(`/api/claims/${claimId}/documents`);
    return res.data;
  },

  getDocumentFileUrl(docId: string): string {
    return `/api/documents/${docId}/file`;
  },

  async verifyDocument(docId: string, remarks?: string): Promise<ClaimDocument> {
    const res = await api.post<ClaimDocument>(`/api/documents/${docId}/verify`, { remarks });
    return res.data;
  },

  async rejectDocument(docId: string, rejectionReason: string): Promise<ClaimDocument> {
    const res = await api.post<ClaimDocument>(`/api/documents/${docId}/reject`, { rejection_reason: rejectionReason });
    return res.data;
  },
};
