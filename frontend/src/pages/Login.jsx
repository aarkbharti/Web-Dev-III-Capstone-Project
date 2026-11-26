import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeFor } from '../components/ProtectedRoute';
import { Alert } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(form.email, form.password);
      navigate(location.state?.from || homeFor(u.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1>Welcome back</h1>
        <p className="muted">Log in to find and book parking slots.</p>
        <Alert>{error}</Alert>
        <label>Email
          <input name="email" type="email" value={form.email} onChange={onChange} placeholder="you@example.com" required autoComplete="email" />
        </label>
        <label>Password
          <input name="password" type="password" value={form.password} onChange={onChange} placeholder="Your password" required autoComplete="current-password" />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
        <p className="muted small">New here? <Link to="/register">Create an account</Link></p>
        <details className="demo">
          <summary>Demo accounts</summary>
          <p>Driver: driver@parkeasy.com / Driver@123</p>
          <p>Manager: manager@parkeasy.com / Manager@123</p>
          <p>Admin: admin@parkeasy.com / Admin@123</p>
        </details>
      </form>
    </div>
  );
}
