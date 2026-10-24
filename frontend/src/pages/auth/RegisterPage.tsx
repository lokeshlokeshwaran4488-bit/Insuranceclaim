import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { authService } from '../../services/authService';
import { getErrorMessage } from '../../services/api';
import toast from 'react-hot-toast';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', password: '', confirm_password: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.full_name.trim()) errs.full_name = 'Full name is required';
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) errs.email = 'Valid email required';
    if (form.phone && !form.phone.match(/^\+?[\d\s\-]{7,20}$/)) errs.phone = 'Invalid phone number';
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirm_password) errs.confirm_password = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await authService.register({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        role: 'CUSTOMER',
      });
      toast.success('Account created! Please sign in.');
      navigate('/login');
    } catch (err) {
      setErrors({ submit: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">🛡️</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>InsureClaim AI</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Claim Management Platform</div>
          </div>
        </div>

        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">Register to manage your insurance claims</p>

        {errors.submit && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>{errors.submit}</div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label required">Full Name</label>
            <input
              type="text" className="form-input" placeholder="Amit Verma"
              value={form.full_name} onChange={set('full_name')} disabled={loading}
            />
            {errors.full_name && <span className="form-error">{errors.full_name}</span>}
          </div>

          <div className="form-group">
            <label className="form-label required">Email Address</label>
            <input
              type="email" className="form-input" placeholder="you@example.com"
              value={form.email} onChange={set('email')} disabled={loading}
            />
            {errors.email && <span className="form-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              type="tel" className="form-input" placeholder="+91 98765 43210"
              value={form.phone} onChange={set('phone')} disabled={loading}
            />
            {errors.phone && <span className="form-error">{errors.phone}</span>}
          </div>

          <div className="form-group">
            <label className="form-label required">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                className="form-input" placeholder="Min. 8 characters"
                value={form.password} onChange={set('password')} disabled={loading}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <span className="form-error">{errors.password}</span>}
          </div>

          <div className="form-group">
            <label className="form-label required">Confirm Password</label>
            <input
              type="password" className="form-input" placeholder="Repeat your password"
              value={form.confirm_password} onChange={set('confirm_password')} disabled={loading}
            />
            {errors.confirm_password && <span className="form-error">{errors.confirm_password}</span>}
          </div>

          <button
            type="submit" className="btn btn-primary w-full"
            disabled={loading} style={{ padding: '11px', fontSize: 14 }}
          >
            {loading ? <><span className="spinner spinner-sm" /> Creating account...</> : <><UserPlus size={16} /> Create Account</>}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--primary-light)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
