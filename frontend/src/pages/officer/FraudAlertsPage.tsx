import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldAlert, Eye, ArrowRight } from 'lucide-react';
import { claimService } from '../../services/claimService';
import type { Claim } from '../../types';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate, getFraudColor, getRiskConfig } from '../../utils/formatters';

const FraudAlertsPage: React.FC = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClaims = async () => {
      try {
        const res = await claimService.listClaims({ page_size: 100 });
        setClaims(res.claims.filter((c) => (c.fraud_score ?? 0) >= 0.25 || c.status === 'UNDER_FRAUD_REVIEW'));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchClaims();
  }, []);

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading fraud alerts...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Fraud Monitoring & Risk Alerts</h1>
          <p className="page-subtitle">Claims flagged by XGBoost pattern detection and inconsistency heuristics</p>
        </div>
      </div>

      <div className="card">
        {claims.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><ShieldAlert size={32} /></div>
            <div className="empty-state-title">No Fraud Alerts</div>
            <div className="empty-state-text">No suspicious claims detected in the system.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Incident Type</th>
                  <th>Requested Amount</th>
                  <th>Risk Level</th>
                  <th>Fraud Probability</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => {
                  const risk = claim.risk_level ? getRiskConfig(claim.risk_level) : null;
                  return (
                    <tr key={claim.id}>
                      <td>
                        <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>
                          {claim.claim_number}
                        </code>
                      </td>
                      <td>{claim.incident_type}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(claim.requested_amount)}</td>
                      <td>
                        {risk ? (
                          <span className={`badge ${risk.className}`}>{risk.label}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 60, height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${((claim.fraud_score ?? 0) * 100)}%`,
                              height: '100%',
                              background: getFraudColor(claim.fraud_score ?? 0),
                            }} />
                          </div>
                          <span style={{ fontWeight: 800, color: getFraudColor(claim.fraud_score ?? 0) }}>
                            {claim.fraud_score !== undefined ? `${(claim.fraud_score * 100).toFixed(0)}%` : '—'}
                          </span>
                        </div>
                      </td>
                      <td><ClaimStatusBadge status={claim.status} /></td>
                      <td>
                        <Link to={`/customer/claims/${claim.id}`} className="btn btn-secondary btn-sm">
                          Investigate <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FraudAlertsPage;
