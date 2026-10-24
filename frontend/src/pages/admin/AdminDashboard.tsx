import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Shield, FileText, AlertTriangle, CreditCard, BarChart3,
  Clock, UserPlus, Search
} from 'lucide-react';
import toast from 'react-hot-toast';

import { analyticsService } from '../../services/analyticsService';
import { customerService } from '../../services/customerService';
import { getErrorMessage } from '../../services/api';
import type { DashboardStats, User } from '../../types';
import { formatCurrency, getInitials, formatDate } from '../../utils/formatters';

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Customer Management on Admin Dashboard
  const [customers, setCustomers] = useState<User[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [searchCustomer, setSearchCustomer] = useState('');

  // Add Customer Modal State
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await analyticsService.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load dashboard stats', err);
    }
  };

  const fetchCustomers = async (search?: string) => {
    setCustomersLoading(true);
    try {
      const data = await customerService.getCustomers(search);
      setCustomers(data.customers || []);
    } catch (err) {
      console.error('Failed to load customers', err);
    } finally {
      setCustomersLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchCustomers()]);
      setLoading(false);
    };
    init();
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setCreating(true);
    try {
      await customerService.createCustomer({
        full_name: fullName,
        email,
        phone: phone.trim() ? phone.trim() : undefined,
        address: address.trim() ? address.trim() : undefined,
        password,
      });

      toast.success(`Customer ${fullName} created successfully!`);
      setShowAddCustomerModal(false);
      setFullName('');
      setEmail('');
      setPhone('');
      setAddress('');
      setPassword('');

      // Refresh customers list and KPI stats immediately without page reload
      await Promise.all([fetchCustomers(searchCustomer), fetchStats()]);
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    if (!searchCustomer) return true;
    const term = searchCustomer.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      (c.phone && c.phone.includes(term))
    );
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading admin metrics...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Executive Overview</h1>
          <p className="page-subtitle">Platform health, claim throughput, fraud prevention, and settlements</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowAddCustomerModal(true)}
            className="btn btn-primary"
            id="btn-add-customer"
          >
            <UserPlus size={16} /> Add Customer
          </button>
          <Link to="/admin/analytics" className="btn btn-secondary">
            <BarChart3 size={16} /> Deep Analytics
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Policyholders</span>
            <div className="stat-card-icon blue"><Users size={20} /></div>
          </div>
          <div className="stat-card-value">{stats?.total_customers ?? 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Active Policies</span>
            <div className="stat-card-icon cyan"><Shield size={20} /></div>
          </div>
          <div className="stat-card-value">{stats?.active_policies ?? 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Claims Filed</span>
            <div className="stat-card-icon blue"><FileText size={20} /></div>
          </div>
          <div className="stat-card-value">{stats?.total_claims ?? 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Pending Claims</span>
            <div className="stat-card-icon yellow"><Clock size={20} /></div>
          </div>
          <div className="stat-card-value">{stats?.pending_claims ?? 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">AI Fraud Alerts</span>
            <div className="stat-card-icon red"><AlertTriangle size={20} /></div>
          </div>
          <div className="stat-card-value">{stats?.fraud_alerts ?? 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Disbursed</span>
            <div className="stat-card-icon green"><CreditCard size={20} /></div>
          </div>
          <div className="stat-card-value">{formatCurrency(stats?.total_paid_amount ?? 0)}</div>
        </div>
      </div>

      {/* Registered Customers & Policyholders Section */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="card-title">Registered Policyholders & Customers</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              {customers.length} total customer{customers.length === 1 ? '' : 's'} enrolled in the system
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 200 }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Search customers..."
                value={searchCustomer}
                onChange={(e) => setSearchCustomer(e.target.value)}
                style={{ paddingLeft: 32, paddingRight: 10, height: 34, fontSize: 13 }}
                id="search-customer-input"
              />
            </div>
            <button
              onClick={() => setShowAddCustomerModal(true)}
              className="btn btn-primary btn-sm"
              id="btn-quick-add-customer"
            >
              <UserPlus size={14} /> Add Customer
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          {customersLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading customers...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              No customers found. Click &quot;Add Customer&quot; above to register a new policyholder.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="sidebar-user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                          {getInitials(c.full_name)}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {c.full_name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{c.email}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{c.phone || '—'}</span>
                    </td>
                    <td>
                      <span className="badge badge-blue">Customer</span>
                    </td>
                    <td>
                      <span className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {formatDate(c.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quick Navigation Panels */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Governance & Administration</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link to="/admin/users" className="btn btn-secondary" style={{ justifyContent: 'space-between' }}>
              <span>User & Role Management</span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </Link>
            <Link to="/admin/policies" className="btn btn-secondary" style={{ justifyContent: 'space-between' }}>
              <span>Underwriting & Policies</span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </Link>
            <Link to="/admin/claims" className="btn btn-secondary" style={{ justifyContent: 'space-between' }}>
              <span>Claims Adjudication</span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Settlements & Compliance</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link to="/admin/settlements" className="btn btn-secondary" style={{ justifyContent: 'space-between' }}>
              <span>Settlement Disbursements</span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </Link>
            <Link to="/admin/analytics" className="btn btn-secondary" style={{ justifyContent: 'space-between' }}>
              <span>Claims Performance Analytics</span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </Link>
            <Link to="/admin/audit-logs" className="btn btn-secondary" style={{ justifyContent: 'space-between' }}>
              <span>Security & Audit Logs</span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ADD CUSTOMER MODAL */}
      {showAddCustomerModal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Register New Customer</h3>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                className="modal-close"
                id="btn-close-customer-modal"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateCustomer}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label required">Full Name</label>
                  <input
                    type="text"
                    id="customer-fullname-input"
                    className="form-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Anand Sharma"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Email Address</label>
                  <input
                    type="email"
                    id="customer-email-input"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="anand@example.com"
                    required
                  />
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                      type="text"
                      id="customer-phone-input"
                      className="form-input"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91-9876543210"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">City / Address</label>
                    <input
                      type="text"
                      id="customer-address-input"
                      className="form-input"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Mumbai, Maharashtra"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label required">Password</label>
                  <input
                    type="password"
                    id="customer-password-input"
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Secure password (min 6 characters)"
                    minLength={6}
                    required
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Must be at least 6 characters. The customer can use this to sign in.
                  </span>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="btn btn-secondary"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  id="btn-submit-customer"
                  disabled={creating}
                >
                  {creating ? 'Adding Customer...' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
