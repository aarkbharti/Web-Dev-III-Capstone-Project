import { useEffect } from 'react';

export const StatusBadge = ({ status }) => <span className={`badge badge-${status}`}>{status}</span>;

export function Alert({ type = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role="alert">
      <span>{children}</span>
      {onClose && <button className="alert-x" onClick={onClose} aria-label="Dismiss">x</button>}
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      <span className="muted">Page {page} of {pages}</span>
      <button className="btn btn-ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}

// Bar that fills according to value/max (plain CSS chart, no library).
export function Bar({ value, max, label, tone = 'blue', suffix = '' }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track"><div className={`bar-fill bar-${tone}`} style={{ width: value ? `${pct}%` : '0%' }} /></div>
      <span className="bar-value">{value}{suffix}</span>
    </div>
  );
}

export function useAutoDismiss(message, clear, ms = 5000) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(clear, ms);
    return () => clearTimeout(t);
  }, [message, clear, ms]);
}

// ---- date helpers shared by pages ----
const pad = (n) => String(n).padStart(2, '0');
export const toInputValue = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
export const fmt = (d) => (d ? new Date(d).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
