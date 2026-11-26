import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Alert, fmt, money, toInputValue } from '../components/ui';

export default function LotDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const canBook = user.role === 'driver';

  const [lot, setLot] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState(() => {
    const start = new Date(Date.now() + 5 * 60000);
    return { start: toInputValue(start), end: toInputValue(new Date(start.getTime() + 2 * 3600000)), vehicleNumber: '' };
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const windowValid = useMemo(() => form.start && form.end && new Date(form.end) > new Date(form.start), [form.start, form.end]);

  const loadLot = useCallback(() => api(`/lots/${id}`).then((d) => setLot(d.data)).catch((e) => setError(e.message)), [id]);

  const loadSlots = useCallback(() => {
    if (!windowValid) return Promise.resolve();
    const q = new URLSearchParams({ start: new Date(form.start).toISOString(), end: new Date(form.end).toISOString() });
    return api(`/lots/${id}/slots?${q}`)
      .then((d) => {
        setSlots(d.data);
        setSelected((cur) => (cur && d.data.find((s) => s._id === cur && s.available) ? cur : null));
      })
      .catch((e) => setError(e.message));
  }, [id, form.start, form.end, windowValid]);

  useEffect(() => { loadLot(); }, [loadLot]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  // Join this lot's room; refresh the grid when anyone books, cancels, enters or leaves.
  useEffect(() => {
    if (!socket) return undefined;
    const onChanged = (p) => {
      if (p.lotId !== id) return;
      setLot((l) => (l ? { ...l, availability: { total: p.total, busy: p.busy, available: p.available } } : l));
      loadSlots();
    };
    socket.emit('lot:join', id);
    socket.on('lot:changed', onChanged);
    return () => { socket.emit('lot:leave', id); socket.off('lot:changed', onChanged); };
  }, [socket, id, loadSlots]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const book = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (!selected) return setError('Pick a free slot first');
    setBusy(true);
    try {
      await api('/reservations', {
        method: 'POST',
        body: { slotId: selected, vehicleNumber: form.vehicleNumber, startTime: new Date(form.start).toISOString(), endTime: new Date(form.end).toISOString() },
      });
      setNotice('Slot reserved. You can see it under My bookings.');
      setSelected(null);
      loadSlots();
    } catch (err) {
      setError(err.message);
      loadSlots();
    } finally {
      setBusy(false);
    }
  };

  if (!lot) return <div>{error ? <Alert>{error}</Alert> : <p className="muted">Loading...</p>}</div>;

  const shown = slots.filter((s) => !typeFilter || s.type === typeFilter);
  const a = lot.availability || { total: 0, available: 0 };
  const hours = windowValid ? Math.max(1, Math.ceil((new Date(form.end) - new Date(form.start)) / 3600000)) : 0;

  return (
    <div>
      <Link to="/lots" className="back">Back to all lots</Link>
      <div className="page-head">
        <div>
          <h1>{lot.name}</h1>
          <p className="muted">{lot.address}, {lot.city} &middot; Managed by {lot.manager?.name}</p>
        </div>
        <div className="right">
          <div className="rate big">{money(lot.ratePerHour)}<small>/hr</small></div>
          <p className="muted small">{a.available} of {a.total} free right now</p>
        </div>
      </div>

      <div className="split">
        <section className="card">
          <div className="card-head">
            <h2>Choose a slot</h2>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Slot type">
              <option value="">All types</option>
              <option value="car">Car</option>
              <option value="bike">Bike</option>
              <option value="ev">EV charging</option>
            </select>
          </div>
          <div className="legend">
            <span><i className="dot free" /> Free</span><span><i className="dot taken" /> Taken</span><span><i className="dot pick" /> Selected</span>
          </div>
          {windowValid ? (
            <div className="slots">
              {shown.map((s) => (
                <button
                  key={s._id}
                  type="button"
                  disabled={!s.available || !canBook}
                  className={`slot ${s.available ? 'free' : 'taken'} ${selected === s._id ? 'pick' : ''}`}
                  onClick={() => setSelected(s._id)}
                  title={s.available ? `Slot ${s.number} is free` : `Slot ${s.number} is taken for this time`}
                >
                  <strong>{s.number}</strong>
                  <small>{s.type === 'ev' ? 'EV' : s.type}</small>
                </button>
              ))}
              {shown.length === 0 && <p className="muted">No slots to show.</p>}
            </div>
          ) : <p className="muted">End time must be after start time.</p>}
        </section>

        <aside className="card">
          <h2>{canBook ? 'Book this lot' : 'Booking window'}</h2>
          <form onSubmit={book}>
            <Alert onClose={() => setError('')}>{error}</Alert>
            <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
            <label>Arrival
              <input type="datetime-local" name="start" value={form.start} onChange={onChange} required />
            </label>
            <label>Departure
              <input type="datetime-local" name="end" value={form.end} onChange={onChange} required />
            </label>
            {canBook ? (
              <>
                <label>Vehicle number
                  <input name="vehicleNumber" value={form.vehicleNumber} onChange={onChange} placeholder="HR26AB1234" required />
                </label>
                <div className="summary">
                  <div><span>Selected slot</span><strong>{selected ? slots.find((s) => s._id === selected)?.number : 'None'}</strong></div>
                  <div><span>Estimated fee</span><strong>{money(hours * lot.ratePerHour)}</strong></div>
                  <p className="muted small">{windowValid ? `${fmt(form.start)} to ${fmt(form.end)}. ` : ''}The final fee is charged on exit, per started hour.</p>
                </div>
                <button className="btn btn-primary btn-block" disabled={busy || !selected}>{busy ? 'Reserving...' : 'Reserve slot'}</button>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => navigate('/bookings')}>View my bookings</button>
              </>
            ) : <p className="muted small">Only driver accounts can reserve slots. You can change the times to preview availability.</p>}
          </form>
        </aside>
      </div>
    </div>
  );
}
