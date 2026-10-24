import React from 'react';
import type { ClaimStatus, RiskLevel, DocumentStatus, PaymentStatus } from '../../types';
import { getClaimStatusConfig, getRiskConfig, getDocStatusConfig, getPaymentStatusConfig } from '../../utils/formatters';

interface StatusBadgeProps {
  status: ClaimStatus;
}

interface RiskBadgeProps {
  risk: RiskLevel | null | undefined;
}

interface DocStatusBadgeProps {
  status: DocumentStatus;
}

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
}

export const ClaimStatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = getClaimStatusConfig(status);
  return <span className={`badge ${config.className}`}>{config.label}</span>;
};

export const RiskBadge: React.FC<RiskBadgeProps> = ({ risk }) => {
  const config = getRiskConfig(risk);
  return <span className={`badge ${config.className}`}>{config.label}</span>;
};

export const DocStatusBadge: React.FC<DocStatusBadgeProps> = ({ status }) => {
  const config = getDocStatusConfig(status);
  return <span className={`badge ${config.className}`}>{config.label}</span>;
};

export const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({ status }) => {
  const config = getPaymentStatusConfig(status);
  return <span className={`badge ${config.className}`}>{config.label}</span>;
};

// Generic badge
interface GenericBadgeProps {
  label: string;
  variant?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan' | 'gray';
}

export const Badge: React.FC<GenericBadgeProps> = ({ label, variant = 'blue' }) => (
  <span className={`badge badge-${variant}`}>{label}</span>
);
