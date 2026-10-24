import React from 'react';
import type { ClaimTimeline as ClaimTimelineType } from '../../types';
import { formatDateTime, getClaimStatusConfig } from '../../utils/formatters';
import { CheckCircle, Circle, AlertCircle, Clock, XCircle } from 'lucide-react';

interface Props {
  timeline: ClaimTimelineType[];
}

const getTimelineIcon = (status: string) => {
  if (['APPROVED', 'SETTLED', 'CLOSED', 'DOCUMENTS_RECEIVED', 'AI_ANALYSIS_COMPLETED'].includes(status)) {
    return <CheckCircle size={14} />;
  }
  if (['REJECTED', 'UNDER_FRAUD_REVIEW'].includes(status)) {
    return <XCircle size={14} />;
  }
  if (['ADDITIONAL_DOCUMENTS_REQUIRED', 'APPROVAL_PENDING'].includes(status)) {
    return <AlertCircle size={14} />;
  }
  if (['DRAFT'].includes(status)) {
    return <Clock size={14} />;
  }
  return <Circle size={14} />;
};

const getTimelineDotClass = (status: string): string => {
  if (['APPROVED', 'SETTLED', 'CLOSED', 'DOCUMENTS_RECEIVED'].includes(status)) return 'success';
  if (['REJECTED', 'UNDER_FRAUD_REVIEW'].includes(status)) return 'danger';
  if (status === 'DRAFT') return '';
  return 'active';
};

const ClaimTimelineComponent: React.FC<Props> = ({ timeline }) => {
  if (!timeline.length) {
    return (
      <div className="empty-state">
        <p className="text-secondary">No timeline events yet.</p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {timeline.map((item, idx) => {
        const config = getClaimStatusConfig(item.status as any);
        const dotClass = getTimelineDotClass(item.status);
        const isLast = idx === timeline.length - 1;

        return (
          <div key={item.id} className="timeline-item">
            <div className={`timeline-dot ${dotClass}`}>
              {getTimelineIcon(item.status)}
            </div>
            <div className="timeline-content" style={{ paddingBottom: isLast ? 0 : 24 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                <span className="timeline-status">{config.label}</span>
              </div>
              <div className="timeline-desc">{item.description}</div>
              <div className="timeline-time">{formatDateTime(item.created_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ClaimTimelineComponent;
