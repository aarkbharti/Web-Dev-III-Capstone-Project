import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api/client';
import { useSocket } from '../context/SocketContext';
import { Alert, Bar, Pagination, StatusBadge, fmt, money, toInputValue, useAutoDismiss } from '../components/ui';

export default function Manager() {
  const [tab, setTab] = useState('lots');
  return (
    <div>
      <div className="page-head"><div><h1>Manage parking</h1><p className="muted">Lots, slots, bookings and reports for the lots you run.</p></div></div>
      <div className="tabs">
        {[['lots', 'My lots'], ['bookings', 'Bookings'], ['reports', 'Reports']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'lots' && <LotsTab />}
      {tab === 'bookings' && <BookingsTab />}
      {tab === 'reports' && <ReportsTab />}
    </div>
  );
}

/* ---------------- Lots ---------------- */
const emptyLot = { name: '', address: '', city: '', ratePerHour: '' };

function LotsTab() {
  const socket = useSocket();
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyLot);
  const [editing, setEditing] = useState(null); // lot id being edited
  const [editForm, setEditForm] = useState(emptyLot);
  const [slotFor, setSlotFor] = useState(null); // lot id whose "add slots" form is open
  const [slotForm, setSlotForm] = useState({ prefix: 'A', count: 10, type: 'car' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useAutoDismiss(notice, () => setNotice(''));

  const load = useCallback(() => api('/lots/mine').then((d) => setLots(d.data)).catch((e) => setError(e.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.emit('lots:subscribe');
    socket.on('lot:changed', load);
    return () => { socket.emit('lots:unsubscribe'); socket.off('lot:changed', load); };
  }, [socket, load]);

  const run = async (fn, okMsg) => {
    setError(''); setNotice('');
    try { await fn(); if (okMsg) setNotice(okMsg); await load(); return true; } catch (e) { setError(e.message); return false; }
  };

  const createLot = async (e) => {
    e.preventDefault();
    const ok = await run(() => api('/lots', { method: 'POST', body: { ...form, ratePerHour: Number(form.ratePerHour) } }), 'Parking lot created. Now add some slots to it.');
    if (ok) setForm(emptyLot);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const ok = await run(() => api(`/lots/${editing}`, { method: 'PUT', body: { ...editForm, ratePerHour: Number(editForm.ratePerHour) } }), 'Lot updated');
    if (ok) setEditing(null);
  };

  const addSlots = async (e) => {
    e.preventDefault();
    const ok = await run(() => api(`/lots/${slotFor}/slots`, { method: 'POST', body: { ...slotForm, count: Number(slotForm.count) } }), 'Slots added');
    if (ok) setSlotFor(null);
  };

  return (
    <div className="split">
      <section>
        <Alert onClose={() => setError('')}>{error}</Alert>
        <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
        {loading ? <p className="muted">Loading...</p> : lots.length === 0 ? <p className="muted">You have no lots yet. Create your first one.</p> : (
          <div className="list">
            {lots.map((lot) => {
              const a = lot.availability || { total: 0, available: 0 };
              return (
                <article key={lot._id} className="card">
                  <div className="lot-top">
                    <div>
                      <h3>{lot.name} {!lot.isActive && <span className="badge badge-cancelled">paused</span>}</h3>
                      <p className="muted">{lot.address}, {lot.city}</p>
                    </div>
                    <span className="rate">{money(lot.ratePerHour)}<small>/hr</small></span>
                  </div>
                  <p className="muted small">{a.available} of {a.total} slots free now{lot.manager?.name ? ` · manager: ${lot.manager.name}` : ''}</p>
                  <div className="row">
                    <button className="btn btn-ghost" onClick={() => { setSlotFor(slotFor === lot._id ? null : lot._id); setEditing(null); }}>Add slots</button>
                    <button className="btn btn-ghost" onClick={() => { setEditing(editing === lot._id ? null : lot._id); setEditForm({ name: lot.name, address: lot.address, city: lot.city, ratePerHour: lot.ratePerHour }); setSlotFor(null); }}>Edit</button>
                    <button className="btn btn-ghost" onClick={() => run(() => api(`/lots/${lot._id}`, { method: 'PUT', body: { isActive: !lot.isActive } }), lot.isActive ? 'Lot paused' : 'Lot reopened')}>{lot.isActive ? 'Pause' : 'Reopen'}</button>
                    <button className="btn btn-danger" onClick={() => window.confirm(`Delete ${lot.name}?`) && run(() => api(`/lots/${lot._id}`, { method: 'DELETE' }), 'Lot deleted')}>Delete</button>
                  </div>

                  {slotFor === lot._id && (
                    <form className="inline-form" onSubmit={addSlots}>
                      <label>Prefix<input value={slotForm.prefix} onChange={(e) => setSlotForm({ ...slotForm, prefix: e.target.value })} maxLength={3} required /></label>
                      <label>How many<input type="number" min="1" max="200" value={slotForm.count} onChange={(e) => setSlotForm({ ...slotForm, count: e.target.value })} required /></label>
                      <label>Type
                        <select value={slotForm.type} onChange={(e) => setSlotForm({ ...slotForm, type: e.target.value })}>
                          <option value="car">Car</option><option value="bike">Bike</option><option value="ev">EV</option>
                        </select>
                      </label>
                      <button className="btn btn-primary">Create slots</button>
                    </form>
                  )}
                  {editing === lot._id && (
                    <form className="inline-form" onSubmit={saveEdit}>
                      <label>Name<input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></label>
                      <label>Address<input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} required /></label>
                      <label>City<input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} required /></label>
                      <label>Rate/hr<input type="number" min="1" value={editForm.ratePerHour} onChange={(e) => setEditForm({ ...editForm, ratePerHour: e.target.value })} required /></label>
                      <button className="btn btn-primary">Save</button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <aside className="card">
        <h2>Add a parking lot</h2>
        <form onSubmit={createLot}>
          <label>Lot name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Address<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required /></label>
          <label>City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></label>
          <label>Rate per hour (Rs.)<input type="number" min="1" value={form.ratePerHour} onChange={(e) => setForm({ ...form, ratePerHour: e.target.value })} required /></label>
          <button className="btn btn-primary btn-block">Create lot</button>
        </form>
      </aside>
    </div>
  );
}

/* ---------------- Bookings ---------------- */
function BookingsTab() {
  const socket = useSocket();
  const [lots, setLots] = useState([]);
  const [filters, setFilters] = useState({ lotId: '', status: '', date: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], pages: 1, total: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useAutoDismiss(notice, () => setNotice(''));

  useEffect(() => { api('/lots/mine').then((d) => setLots(d.data)).catch(() => {}); }, []);

  const load = useCallback(() => {
    api(`/reservations${qs({ ...filters, page, limit: 8 })}`).then(setResult).catch((e) => setError(e.message));
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.emit('lots:subscribe');
    socket.on('lot:changed', load);
    return () => { socket.emit('lots:unsubscribe'); socket.off('lot:changed', load); };
  }, [socket, load]);

  const act = async (id, action) => {
    setError(''); setNotice('');
    try { const d = await api(`/reservations/${id}/${action}`, { method: 'PATCH' }); setNotice(d.message); load(); } catch (e) { setError(e.message); }
  };
  const setF = (k, v) => { setFilters({ ...filters, [k]: v }); setPage(1); };

  return (
    <div>
      <div className="toolbar">
        <select value={filters.lotId} onChange={(e) => setF('lotId', e.target.value)}>
          <option value="">All my lots</option>
          {lots.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setF('status', e.target.value)}>
          <option value="">Any status</option>
          {['reserved', 'active', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={filters.date} onChange={(e) => setF('date', e.target.value)} />
        <span className="muted">{result.total} booking(s)</span>
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Lot / slot</th><th>Driver</th><th>Vehicle</th><th>Window</th><th>Status</th><th>Fee</th><th /></tr></thead>
          <tbody>
            {result.data.map((r) => (
              <tr key={r._id}>
                <td><strong>{r.lot?.name}</strong><br /><span className="muted small">Slot {r.slot?.number}</span></td>
                <td>{r.user?.name}<br /><span className="muted small">{r.user?.email}</span></td>
                <td>{r.vehicleNumber}</td>
                <td>{fmt(r.startTime)}<br /><span className="muted small">to {fmt(r.endTime)}</span></td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.status === 'completed' ? money(r.fee) : '-'}</td>
                <td className="actions">
                  {r.status === 'reserved' && <><button className="btn btn-small" onClick={() => act(r._id, 'checkin')}>Check in</button><button className="btn btn-small btn-danger" onClick={() => act(r._id, 'cancel')}>Cancel</button></>}
                  {r.status === 'active' && <button className="btn btn-small btn-primary" onClick={() => act(r._id, 'checkout')}>Check out</button>}
                </td>
              </tr>
            ))}
            {result.data.length === 0 && <tr><td colSpan="7" className="muted center">No bookings match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={result.pages} onChange={setPage} />
    </div>
  );
}

/* ---------------- Reports ---------------- */
function ReportsTab() {
  const [lots, setLots] = useState([]);
  const [range, setRange] = useState({
    from: toInputValue(new Date(Date.now() - 30 * 86400000)).slice(0, 10),
    to: toInputValue(new Date(Date.now() + 7 * 86400000)).slice(0, 10),
    lotId: '',
  });
  const [occ, setOcc] = useState([]);
  const [rev, setRev] = useState(null);
  const [peak, setPeak] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { api('/lots/mine').then((d) => setLots(d.data)).catch(() => {}); }, []);

  useEffect(() => {
    const q = qs({ lotId: range.lotId, from: new Date(`${range.from}T00:00:00`).toISOString(), to: new Date(`${range.to}T23:59:59`).toISOString() });
    setError('');
    Promise.all([api(`/reports/occupancy${q}`), api(`/reports/revenue${q}`), api(`/reports/peak-hours${q}`)])
      .then(([o, r, p]) => { setOcc(o.data); setRev(r); setPeak(p.data); })
      .catch((e) => setError(e.message));
  }, [range]);

  const maxDaily = Math.max(0, ...(rev?.daily.map((d) => d.revenue) || [0]));
  const maxPeak = Math.max(0, ...peak.map((p) => p.bookings));

  return (
    <div>
      <div className="toolbar">
        <label className="inline">From <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="inline">To <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <select value={range.lotId} onChange={(e) => setRange({ ...range, lotId: e.target.value })}>
          <option value="">All my lots</option>
          {lots.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>
      </div>
      <Alert>{error}</Alert>

      {rev && (
        <div className="stats">
          <div className="stat"><span>Revenue</span><strong>{money(rev.totals.revenue)}</strong></div>
          <div className="stat"><span>Completed stays</span><strong>{rev.totals.stays}</strong></div>
          <div className="stat"><span>Average fee</span><strong>{money(rev.totals.avgFee)}</strong></div>
          <div className="stat"><span>Hours parked</span><strong>{rev.totals.hours}</strong></div>
        </div>
      )}

      <div className="split even">
        <section className="card">
          <h2>Occupancy by lot</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lot</th><th>Slots</th><th>Bookings</th><th>Cancelled</th><th>Occupancy</th></tr></thead>
              <tbody>
                {occ.map((o) => (
                  <tr key={o.lotId}>
                    <td>{o.lotName}</td><td>{o.slots}</td><td>{o.bookings}</td>
                    <td>{o.cancelled} <span className="muted small">({o.cancellationRate}%)</span></td>
                    <td><Bar value={o.occupancyRate} max={100} label="" tone="green" suffix="%" /></td>
                  </tr>
                ))}
                {occ.length === 0 && <tr><td colSpan="5" className="muted center">No lots in this report.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h2>Revenue per day</h2>
          {rev?.daily.length ? rev.daily.map((d) => <Bar key={d.date} label={d.date.slice(5)} value={d.revenue} max={maxDaily} />) : <p className="muted">No completed stays in this range.</p>}
          {rev?.byLot.length > 0 && (
            <>
              <h3 className="subhead">Revenue per lot</h3>
              {rev.byLot.map((l) => <p key={l.lotId} className="split-line"><span>{l.lotName}</span><strong>{money(l.revenue)}</strong></p>)}
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Peak hours (booking start time)</h2>
        <div className="cols">
          {peak.map((p) => (
            <div key={p.hour} className="col" title={`${p.hour}:00 - ${p.bookings} booking(s)`}>
              <div className="col-bar" style={{ height: maxPeak ? `${Math.max(p.bookings ? 6 : 0, (p.bookings / maxPeak) * 100)}%` : 0 }} />
              <span>{p.hour}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
