import React, { useEffect, useState } from 'react';
import { Users, Search, Plus, ShieldCheck, Mail, Phone, Calendar, UserPlus } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { customerService } from '../../services/customerService';
import type { User, UserRole } from '../../types';
import { getInitials, getRoleLabel, formatDate } from '../../utils/formatters';
import toast from 'react-hot-toast';

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Add Customer Modal
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custPassword, setCustPassword] = useState('');
  const [custCreating, setCustCreating] = useState(false);

  // Create User Modal (General)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('CLAIM_OFFICER');
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await api.get<{ users: User[] }>('/api/users');
      setUsers(res.data.users);
    } catch (err) {
      console.error('Failed to load users', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !custEmail.trim() || !custPassword.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (custPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setCustCreating(true);
    try {
      await customerService.createCustomer({
        full_name: custName.trim(),
        email: custEmail.trim(),
        phone: custPhone.trim() ? custPhone.trim() : undefined,
        address: custAddress.trim() ? custAddress.trim() : undefined,
        password: custPassword,
      });
      toast.success(`Customer "${custName}" created successfully!`);
      setShowAddCustomerModal(false);
      setCustName('');
      setCustEmail('');
      setCustPhone('');
      setCustAddress('');
      setCustPassword('');
      // Refresh list immediately
      await fetchUsers();
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    } finally {
      setCustCreating(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      toast.error('Please fill in all required fields');
      return;
    }

    setCreating(true);
    try {
      await api.post('/api/users', {
        full_name: fullName,
        email,
        phone: phone || undefined,
        password,
        role,
      });
      toast.success(`User ${fullName} created successfully with role ${role}!`);
      setShowCreateModal(false);
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      await fetchUsers();
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const filtered = users.filter((u) => {
    const matchSearch =
      search === '' ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading users...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">User & Role Management</h1>
          <p className="page-subtitle">Inspect registered customers, claim officers, and administrators</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowAddCustomerModal(true)}
            className="btn btn-primary"
            id="btn-add-customer"
          >
            <UserPlus size={16} /> Add Customer
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-secondary"
            id="btn-create-user"
          >
            <Users size={16} /> Create User
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search by name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
          <select
            className="form-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="ALL">All Roles ({users.length})</option>
            <option value="CUSTOMER">Customers</option>
            <option value="CLAIM_OFFICER">Claim Officers</option>
            <option value="ADMIN">Admins</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="sidebar-user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                        {getInitials(u.full_name)}
                      </div>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name}</span>
                    </div>
                  </td>
                  <td><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{u.email}</span></td>
                  <td><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{u.phone || '—'}</span></td>
                  <td>
                    <span className="badge badge-blue">{getRoleLabel(u.role)}</span>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(u.created_at)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    className="form-input"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="e.g. Anand Sharma"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    placeholder="anand@example.com"
                    required
                  />
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                      type="text"
                      className="form-input"
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">City / Address</label>
                    <input
                      type="text"
                      className="form-input"
                      value={custAddress}
                      onChange={(e) => setCustAddress(e.target.value)}
                      placeholder="e.g. Mumbai, Maharashtra"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label required">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={custPassword}
                    onChange={(e) => setCustPassword(e.target.value)}
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
                  disabled={custCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={custCreating}
                >
                  {custCreating ? 'Adding Customer...' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Provision New System User</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="modal-close"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label required">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah@insureclaim.com"
                    required
                  />
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label required">Role</label>
                    <select
                      className="form-select"
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                    >
                      <option value="CUSTOMER">Customer</option>
                      <option value="CLAIM_OFFICER">Claim Officer</option>
                      <option value="ADMIN">System Administrator</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                      type="text"
                      className="form-input"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label required">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Secure password (min 6 characters)"
                    minLength={6}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
