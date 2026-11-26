import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Alert, Pagination, money, useAutoDismiss } from '../components/ui';

export default function Admin() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ q: '', role: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], pages: 1, total: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useAutoDismiss(notice, () => setNotice(''));

  const loadStats = useCallback(() => api('/admin/stats').then((d) => setStats(d.data)).catch((e) => setError(e.message)), []);
  const loadUsers = useCallback(() => api(`/admin/users${qs({ ...filters, page, limit: 8 })}`).then(setResult).catch((e) => setError(e.message)), [filters, page]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const update = async (path, body, msg) => {
    setError(''); setNotice('');
    try { await api(path, { method: 'PATCH', body }); setNotice(msg); loadUsers(); loadStats(); } catch (e) { setError(e.message); }
  };

  const reservations = stats?.reservations || {};
  const users = stats?.users || {};

  return (
    <div>
      <div className="page-head"><div><h1>Admin</h1><p className="muted">Platform overview and user management.</p></div></div>
      {stats && (
        <div className="stats">
          <div className="stat"><span>Users</span><strong>{Object.values(users).reduce((a, b) => a + b, 0)}</strong><small>{users.driver || 0} drivers, {users.manager || 0} managers</small></div>
          <div className="stat"><span>Parking lots</span><strong>{stats.lots}</strong></div>
          <div className="stat"><span>Bookings</span><strong>{Object.values(reservations).reduce((a, b) => a + b, 0)}</strong><small>{reservations.active || 0} active, {reservations.reserved || 0} reserved</small></div>
          <div className="stat"><span>Total revenue</span><strong>{money(stats.totalRevenue)}</strong></div>
        </div>
      )}

      <section className="card">
        <h2>Users</h2>
        <div className="toolbar">
          <input placeholder="Search name or email" value={filters.q} onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} />
          <select value={filters.role} onChange={(e) => { setFilters({ ...filters, role: e.target.value }); setPage(1); }}>
            <option value="">All roles</option><option value="driver">Drivers</option><option value="manager">Managers</option><option value="admin">Admins</option>
          </select>
          <span className="muted">{result.total} user(s)</span>
        </div>
        <Alert onClose={() => setError('')}>{error}</Alert>
        <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {result.data.map((u) => {
                const locked = u.role === 'admin' || u._id === me._id;
                return (
                  <tr key={u._id}>
                    <td>{u.name}</td><td>{u.email}</td>
                    <td>
                      {locked ? <span className="tag">{u.role}</span> : (
                        <select value={u.role} onChange={(e) => update(`/admin/users/${u._id}/role`, { role: e.target.value }, 'Role updated')}>
                          <option value="driver">driver</option><option value="manager">manager</option>
                        </select>
                      )}
                    </td>
                    <td><span className={`badge ${u.isActive ? 'badge-completed' : 'badge-cancelled'}`}>{u.isActive ? 'active' : 'blocked'}</span></td>
                    <td className="actions">
                      {!locked && <button className={`btn btn-small ${u.isActive ? 'btn-danger' : ''}`} onClick={() => update(`/admin/users/${u._id}/active`, { isActive: !u.isActive }, u.isActive ? 'User blocked' : 'User unblocked')}>{u.isActive ? 'Block' : 'Unblock'}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={result.pages} onChange={setPage} />
      </section>
    </div>
  );
}
