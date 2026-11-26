import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api/client';
import { useSocket } from '../context/SocketContext';
import { Alert, Pagination, money } from '../components/ui';

export default function Lots() {
  const socket = useSocket();
  const [filters, setFilters] = useState({ q: '', city: '' });
  const [applied, setApplied] = useState({ q: '', city: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api(`/lots${qs({ ...applied, page, limit: 9 })}`)
      .then((d) => { setResult(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [applied, page]);

  // Live availability: server pushes new counts whenever any lot changes.
  useEffect(() => {
    if (!socket) return undefined;
    const onChanged = (p) =>
      setResult((r) => ({ ...r, data: r.data.map((l) => (l._id === p.lotId ? { ...l, availability: { total: p.total, busy: p.busy, available: p.available } } : l)) }));
    socket.emit('lots:subscribe');
    socket.on('lot:changed', onChanged);
    return () => { socket.emit('lots:unsubscribe'); socket.off('lot:changed', onChanged); };
  }, [socket]);

  const search = (e) => { e.preventDefault(); setPage(1); setApplied(filters); };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Find parking</h1>
          <p className="muted">Availability updates live while you browse.</p>
        </div>
        <span className="live"><i /> Live</span>
      </div>

      <form className="toolbar" onSubmit={search}>
        <input placeholder="Search by lot name or address" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <input placeholder="City" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
        <button className="btn btn-primary">Search</button>
      </form>

      <Alert>{error}</Alert>
      {loading ? <p className="muted">Loading lots...</p> : result.data.length === 0 ? <p className="muted">No parking lots found.</p> : (
        <div className="grid">
          {result.data.map((lot) => {
            const a = lot.availability || { total: 0, available: 0 };
            const pct = a.total ? Math.round((a.available / a.total) * 100) : 0;
            const tone = a.total === 0 ? 'none' : a.available === 0 ? 'full' : pct <= 25 ? 'low' : 'ok';
            return (
              <Link key={lot._id} to={`/lots/${lot._id}`} className="card lot-card">
                <div className="lot-top">
                  <h3>{lot.name}</h3>
                  <span className="rate">{money(lot.ratePerHour)}<small>/hr</small></span>
                </div>
                <p className="muted">{lot.address}, {lot.city}</p>
                <div className="meter"><div className={`meter-fill meter-${tone}`} style={{ width: `${pct}%` }} /></div>
                <p className={`avail avail-${tone}`}>
                  {a.total === 0 ? 'No slots yet' : a.available === 0 ? 'Full right now' : `${a.available} of ${a.total} slots free now`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
      <Pagination page={page} pages={result.pages} onChange={setPage} />
    </div>
  );
}
