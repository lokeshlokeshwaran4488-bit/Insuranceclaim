import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Calendar, AlertCircle, Plus, CheckCircle2, Clock } from 'lucide-react';
import { policyService } from '../../services/policyService';
import type { Policy } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

const PoliciesPage: React.FC = () => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        const res = await policyService.listPolicies();
        setPolicies(res.policies);
      } catch (err) {
        console.error('Failed to load policies', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPolicies();
  }, []);

  const filtered = policies.filter((p) => {
    if (filter === 'ALL') return true;
    return p.status === filter;
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading policies...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Insurance Policies</h1>
          <p className="page-subtitle">View your active coverage and insurance plan details</p>
        </div>
        <Link to="/customer/claims/new" className="btn btn-primary">
          <Plus size={16} /> File a Claim
        </Link>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['ALL', 'ACTIVE', 'EXPIRED', 'CANCELLED'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`btn btn-sm ${filter === tab ? 'btn-primary' : 'btn-secondary'}`}
            style={{ textTransform: 'capitalize' }}
          >
            {tab.toLowerCase()} ({tab === 'ALL' ? policies.length : policies.filter((p) => p.status === tab).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Shield size={32} /></div>
            <div className="empty-state-title">No policies found</div>
            <div className="empty-state-text">You do not have any {filter !== 'ALL' ? filter.toLowerCase() : ''} policies.</div>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          {filtered.map((policy) => {
            const isActive = policy.status === 'ACTIVE';
            return (
              <div key={policy.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className={`stat-card-icon ${isActive ? 'blue' : 'gray'}`}>
                      <Shield size={22} />
                    </div>
                    <div>
                      <span className="badge badge-blue" style={{ fontSize: 11, marginBottom: 4, display: 'inline-block' }}>
                        {policy.policy_type}
                      </span>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {policy.policy_number}
                      </h3>
                    </div>
                  </div>
                  <span className={`badge ${isActive ? 'badge-green' : 'badge-gray'}`}>
                    {policy.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '16px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Coverage</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(policy.coverage_amount)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Premium</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>{formatCurrency(policy.premium_amount)}/yr</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Deductible</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>{formatCurrency(policy.deductible_amount)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} />
                    <span>Valid: {formatDate(policy.start_date)} — {formatDate(policy.expiry_date)}</span>
                  </div>
                  {isActive && (
                    <Link to={`/customer/claims/new?policy_id=${policy.id}`} className="btn btn-ghost btn-sm" style={{ color: 'var(--primary-light)' }}>
                      Claim Against Policy →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PoliciesPage;
