import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeFor } from '../components/ProtectedRoute';
import { Alert } from '../components/ui';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'driver' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { ...form };
      if (!payload.phone) delete payload.phone;
      const u = await register(payload);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1>Create your account</h1>
        <p className="muted">Drivers book slots. Managers run parking lots.</p>
        <Alert>{error}</Alert>
        <label>Full name
          <input name="name" value={form.name} onChange={onChange} required minLength={2} />
        </label>
        <label>Email
          <input name="email" type="email" value={form.email} onChange={onChange} required />
        </label>
        <label>Phone (optional)
          <input name="phone" value={form.phone} onChange={onChange} placeholder="9876543210" />
        </label>
        <label>Password
          <input name="password" type="password" value={form.password} onChange={onChange} required minLength={6} />
        </label>
        <label>I am a
          <select name="role" value={form.role} onChange={onChange}>
            <option value="driver">Driver (I want to park)</option>
            <option value="manager">Lot manager (I run a parking lot)</option>
          </select>
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating...' : 'Sign up'}</button>
        <p className="muted small">Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
