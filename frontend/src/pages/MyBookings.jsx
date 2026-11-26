import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api/client';
import { Alert, Pagination, StatusBadge, fmt, money, useAutoDismiss } from '../components/ui';

const TABS = ['', 'reserved', 'active', 'completed', 'cancelled'];

export default function MyBookings() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useAutoDismiss(notice, () => setNotice(''));

  const load = useCallback(() => {
    api(`/reservations/mine${qs({ status, page, limit: 6 })}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const act = async (id, action) => {
    setError(''); setNotice('');
    try {
      const d = await api(`/reservations/${id}/${action}`, { method: 'PATCH' });
      setNotice(d.message);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div><h1>My bookings</h1><p className="muted">Check in when you arrive and check out when you leave. The fee is calculated on checkout.</p></div>
        <Link className="btn btn-primary" to="/lots">New booking</Link>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t || 'all'} className={status === t ? 'tab on' : 'tab'} onClick={() => { setStatus(t); setPage(1); }}>{t || 'all'}</button>
        ))}
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>

      {loading ? <p className="muted">Loading...</p> : result.data.length === 0 ? <p className="muted">Nothing here yet.</p> : (
        <div className="list">
          {result.data.map((r) => (
            <article key={r._id} className="card booking">
              <div className="booking-main">
                <div className="booking-title">
                  <h3>{r.lot?.name}</h3><StatusBadge status={r.status} />
                </div>
                <p className="muted">Slot <strong>{r.slot?.number}</strong> &middot; {r.vehicleNumber} &middot; {r.lot?.city}</p>
                <p>{fmt(r.startTime)} <span className="muted">to</span> {fmt(r.endTime)}</p>
                {r.status === 'completed' && <p className="fee">Paid {money(r.fee)} for {r.billedHours} hour(s)</p>}
                {r.status === 'active' && <p className="muted small">Entered at {fmt(r.entryTime)}</p>}
              </div>
              <div className="booking-actions">
                {r.status === 'reserved' && (
                  <>
                    <button className="btn btn-primary" onClick={() => act(r._id, 'checkin')}>Check in</button>
                    <button className="btn btn-danger" onClick={() => act(r._id, 'cancel')}>Cancel</button>
                  </>
                )}
                {r.status === 'active' && <button className="btn btn-primary" onClick={() => act(r._id, 'checkout')}>Check out and pay</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      <Pagination page={page} pages={result.pages} onChange={setPage} />
    </div>
  );
}
