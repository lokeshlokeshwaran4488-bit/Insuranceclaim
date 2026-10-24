import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, Search, Filter, ArrowRight, Eye, ShieldAlert } from 'lucide-react';
import { claimService } from '../../services/claimService';
import type { Claim } from '../../types';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate } from '../../utils/formatters';

const ClaimsListPage: React.FC = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    const fetchClaims = async () => {
      try {
        const res = await claimService.listClaims({ page_size: 100 });
        setClaims(res.claims);
      } catch (err) {
        console.error('Failed to load claims', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClaims();
  }, []);

  const filtered = claims.filter((c) => {
    const matchSearch =
      search === '' ||
      c.claim_number.toLowerCase().includes(search.toLowerCase()) ||
      c.incident_type.toLowerCase().includes(search.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(search.toLowerCase()));

    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading claims...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Insurance Claims</h1>
          <p className="page-subtitle">Track status, timeline, document uploads, and settlement payouts</p>
        </div>
        <Link to="/customer/claims/new" className="btn btn-primary">
          <Plus size={16} /> New Claim
        </Link>
      </div>

      {/* Search & Filter Bar */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search by claim ID, incident type, keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={16} style={{ color: 'var(--text-muted)' }} />
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_OFFICER_REVIEW">Under Review</option>
              <option value="AI_ANALYSIS_COMPLETED">AI Analyzed</option>
              <option value="APPROVED">Approved</option>
              <option value="SETTLED">Settled</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Claims List */}
      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><FileText size={32} /></div>
            <div className="empty-state-title">No claims found</div>
            <div className="empty-state-text">
              {search || statusFilter !== 'ALL' ? 'Try adjusting your filters.' : 'Submit your first claim.'}
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Incident Type</th>
                  <th>Amount Requested</th>
                  <th>Approved</th>
                  <th>Filed Date</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((claim) => (
                  <tr key={claim.id}>
                    <td>
                      <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>
                        {claim.claim_number}
                      </code>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{claim.incident_type}</span>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatCurrency(claim.requested_amount)}
                    </td>
                    <td style={{ fontWeight: 600, color: claim.approved_amount ? 'var(--success)' : 'var(--text-muted)' }}>
                      {claim.approved_amount ? formatCurrency(claim.approved_amount) : '—'}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {formatDate(claim.created_at)}
                    </td>
                    <td>
                      <ClaimStatusBadge status={claim.status} />
                    </td>
                    <td>
                      <Link to={`/customer/claims/${claim.id}`} className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Eye size={14} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClaimsListPage;
