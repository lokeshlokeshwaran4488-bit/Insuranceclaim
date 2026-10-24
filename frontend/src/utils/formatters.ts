import type { ClaimStatus, DocumentStatus, PaymentStatus, RiskLevel } from '../types';
import { format, formatDistanceToNow } from 'date-fns';

// ── Date ──────────────────────────────────────────────────────────────
export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '—';
  try {
    return format(new Date(date), 'dd MMM yyyy');
  } catch {
    return '—';
  }
};

export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return '—';
  try {
    return format(new Date(date), 'dd MMM yyyy, hh:mm a');
  } catch {
    return '—';
  }
};

export const formatRelativeTime = (date: string | Date | null | undefined): string => {
  if (!date) return '—';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '—';
  }
};

// ── Currency ──────────────────────────────────────────────────────────
export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

// ── File Size ─────────────────────────────────────────────────────────
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

// ── Claim Status ──────────────────────────────────────────────────────
export const getClaimStatusConfig = (status: ClaimStatus): {
  label: string;
  className: string;
  color: string;
} => {
  const configs: Record<ClaimStatus, { label: string; className: string; color: string }> = {
    DRAFT:                        { label: 'Draft',                        className: 'badge-gray',   color: '#64748b' },
    SUBMITTED:                    { label: 'Submitted',                    className: 'badge-blue',   color: '#3b82f6' },
    DOCUMENTS_PENDING:            { label: 'Docs Pending',                 className: 'badge-yellow', color: '#f59e0b' },
    DOCUMENTS_RECEIVED:           { label: 'Docs Received',                className: 'badge-cyan',   color: '#06b6d4' },
    UNDER_VERIFICATION:           { label: 'Verifying',                    className: 'badge-cyan',   color: '#06b6d4' },
    AI_ANALYSIS_COMPLETED:        { label: 'AI Analyzed',                  className: 'badge-purple', color: '#8b5cf6' },
    UNDER_OFFICER_REVIEW:         { label: 'Under Review',                 className: 'badge-blue',   color: '#3b82f6' },
    ADDITIONAL_DOCUMENTS_REQUIRED:{ label: 'Docs Required',               className: 'badge-yellow', color: '#f59e0b' },
    UNDER_FRAUD_REVIEW:           { label: 'Fraud Review',                 className: 'badge-red',    color: '#ef4444' },
    APPROVAL_PENDING:             { label: 'Approval Pending',             className: 'badge-yellow', color: '#f59e0b' },
    APPROVED:                     { label: 'Approved',                     className: 'badge-green',  color: '#10b981' },
    REJECTED:                     { label: 'Rejected',                     className: 'badge-red',    color: '#ef4444' },
    SETTLEMENT_PENDING:           { label: 'Settlement Pending',           className: 'badge-yellow', color: '#f59e0b' },
    SETTLEMENT_PROCESSING:        { label: 'Payment Processing',           className: 'badge-cyan',   color: '#06b6d4' },
    SETTLED:                      { label: 'Settled',                      className: 'badge-green',  color: '#10b981' },
    CLOSED:                       { label: 'Closed',                       className: 'badge-gray',   color: '#64748b' },
  };
  return configs[status] ?? { label: status, className: 'badge-gray', color: '#64748b' };
};

// ── Risk Level ────────────────────────────────────────────────────────
export const getRiskConfig = (risk: RiskLevel | null | undefined) => {
  if (!risk) return { label: '—', className: 'badge-gray' };
  const configs: Record<RiskLevel, { label: string; className: string }> = {
    LOW:       { label: 'Low Risk',       className: 'badge-green' },
    MODERATE:  { label: 'Moderate Risk',  className: 'badge-yellow' },
    HIGH:      { label: 'High Risk',      className: 'badge-red' },
    VERY_HIGH: { label: 'Very High Risk', className: 'badge-red' },
  };
  return configs[risk];
};

// ── Document Status ───────────────────────────────────────────────────
export const getDocStatusConfig = (status: DocumentStatus) => {
  const configs: Record<DocumentStatus, { label: string; className: string }> = {
    UPLOADED:              { label: 'Uploaded',         className: 'badge-blue' },
    PROCESSING:            { label: 'Processing',       className: 'badge-cyan' },
    VERIFIED:              { label: 'Verified',         className: 'badge-green' },
    MISMATCH:              { label: 'Mismatch',         className: 'badge-yellow' },
    REJECTED:              { label: 'Rejected',         className: 'badge-red' },
    MANUAL_REVIEW_REQUIRED:{ label: 'Manual Review',    className: 'badge-yellow' },
  };
  return configs[status] ?? { label: status, className: 'badge-gray' };
};

// ── Payment Status ────────────────────────────────────────────────────
export const getPaymentStatusConfig = (status: PaymentStatus) => {
  const configs: Record<PaymentStatus, { label: string; className: string }> = {
    PENDING:    { label: 'Pending',    className: 'badge-yellow' },
    PROCESSING: { label: 'Processing', className: 'badge-cyan' },
    COMPLETED:  { label: 'Completed',  className: 'badge-green' },
    FAILED:     { label: 'Failed',     className: 'badge-red' },
  };
  return configs[status] ?? { label: status, className: 'badge-gray' };
};

// ── User Role ─────────────────────────────────────────────────────────
export const getRoleLabel = (role: string): string => {
  const labels: Record<string, string> = {
    CUSTOMER: 'Customer',
    CLAIM_OFFICER: 'Claim Officer',
    ADMIN: 'Admin',
  };
  return labels[role] ?? role;
};

// ── Initials ──────────────────────────────────────────────────────────
export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// ── Fraud Probability ─────────────────────────────────────────────────
export const getFraudColor = (probability: number): string => {
  if (probability <= 0.25) return '#10b981';
  if (probability <= 0.50) return '#f59e0b';
  if (probability <= 0.75) return '#ef4444';
  return '#dc2626';
};
