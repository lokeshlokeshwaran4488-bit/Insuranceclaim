import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Eye, Search, Filter } from 'lucide-react';
import { claimService } from '../../services/claimService';
import type { Claim } from '../../types';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate, getFraudColor } from '../../utils/formatters';

const AdminClaimsPage: React.FC = () => {
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
        console.error(err);
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
      c.incident_type.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading all claims...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">All System Claims</h1>
          <p className="page-subtitle">Full repository of claims submitted across all insured members</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search claims..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_OFFICER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="SETTLED">Settled</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Claim ID</th>
                <th>Incident Type</th>
                <th>Requested</th>
                <th>Approved</th>
                <th>Fraud Score</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((claim) => (
                <tr key={claim.id}>
                  <td><code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>{claim.claim_number}</code></td>
                  <td>{claim.incident_type}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(claim.requested_amount)}</td>
                  <td style={{ fontWeight: 600, color: claim.approved_amount ? 'var(--success)' : 'var(--text-muted)' }}>
                    {claim.approved_amount ? formatCurrency(claim.approved_amount) : '—'}
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: getFraudColor(claim.fraud_score ?? 0) }}>
                      {claim.fraud_score !== undefined ? `${(claim.fraud_score * 100).toFixed(0)}%` : '—'}
                    </span>
                  </td>
                  <td><ClaimStatusBadge status={claim.status} /></td>
                  <td><span style={{ fontSize: 12 }}>{formatDate(claim.created_at)}</span></td>
                  <td>
                    <Link to={`/customer/claims/${claim.id}`} className="btn btn-ghost btn-sm">
                      <Eye size={14} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminClaimsPage;
