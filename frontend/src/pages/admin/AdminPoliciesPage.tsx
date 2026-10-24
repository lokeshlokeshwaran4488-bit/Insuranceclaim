import React, { useEffect, useState } from 'react';
import { Shield, Plus, Search, Filter } from 'lucide-react';
import { policyService } from '../../services/policyService';
import type { Policy } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import toast from 'react-hot-toast';

const AdminPoliciesPage: React.FC = () => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchPolicies = async () => {
    try {
      const res = await policyService.listPolicies();
      setPolicies(res.policies);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const filtered = policies.filter((p) => {
    return (
      search === '' ||
      p.policy_number.toLowerCase().includes(search.toLowerCase()) ||
      p.policy_type.toLowerCase().includes(search.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading all policies...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Policy Registry & Underwriting</h1>
          <p className="page-subtitle">All active, expired, and underwritten insurance contracts across customers</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search by policy number or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 38 }}
          />
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Policy Number</th>
                <th>Type</th>
                <th>Coverage Limit</th>
                <th>Annual Premium</th>
                <th>Deductible</th>
                <th>Validity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>{p.policy_number}</code></td>
                  <td><span className="badge badge-blue">{p.policy_type}</span></td>
                  <td style={{ fontWeight: 700 }}>{formatCurrency(p.coverage_amount)}</td>
                  <td>{formatCurrency(p.premium_amount)}</td>
                  <td>{formatCurrency(p.deductible_amount)}</td>
                  <td><span style={{ fontSize: 12 }}>{formatDate(p.start_date)} — {formatDate(p.expiry_date)}</span></td>
                  <td>
                    <span className={`badge ${p.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}`}>
                      {p.status}
                    </span>
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

export default AdminPoliciesPage;
