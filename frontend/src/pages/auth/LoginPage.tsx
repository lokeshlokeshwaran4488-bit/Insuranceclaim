import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Shield, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../services/api';
import toast from 'react-hot-toast';

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');

      // Redirect based on role (AuthContext has user)
      // We'll navigate to a generic route — ProtectedRoute handles redirect
      // Actually read the stored token to determine role
      const stored = localStorage.getItem('access_token');
      if (stored) {
        // Decode JWT payload
        const payload = JSON.parse(atob(stored.split('.')[1]));
        const role = payload.role;
        const routes: Record<string, string> = {
          CUSTOMER: '/customer/dashboard',
          CLAIM_OFFICER: '/officer/dashboard',
          ADMIN: '/admin/dashboard',
        };
        navigate(routes[role] ?? '/customer/dashboard', { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError('');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">🛡️</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>InsureClaim AI</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Claim Management Platform</div>
          </div>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your account to continue</p>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label required">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label required">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex',
                }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--primary-light)' }}>
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
            style={{ padding: '11px', fontSize: 14 }}
          >
            {loading ? (
              <><span className="spinner spinner-sm" /> Signing in...</>
            ) : (
              <><LogIn size={16} /> Sign In</>
            )}
          </button>
        </form>

        {/* Demo credentials */}
        <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Demo Accounts
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { role: 'Customer', email: 'amit@example.com', pass: 'Customer@1234' },
              { role: 'Claim Officer', email: 'officer1@insureclaim.com', pass: 'Officer@1234' },
              { role: 'Admin', email: 'admin@insureclaim.com', pass: 'Admin@1234' },
            ].map((d) => (
              <button
                key={d.role}
                onClick={() => fillDemo(d.email, d.pass)}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  padding: '6px 12px', cursor: 'pointer', color: 'var(--text-secondary)',
                  fontSize: 12, textAlign: 'left', display: 'flex', justifyContent: 'space-between',
                  transition: 'all var(--transition)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.role}</span>
                <span style={{ color: 'var(--text-muted)' }}>{d.email}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--primary-light)', fontWeight: 600 }}>
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
