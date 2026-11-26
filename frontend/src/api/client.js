// Small fetch wrapper: adds the access token, and on a 401 it tries the refresh token once.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const STORAGE_KEY = 'parkeasy_tokens';

let tokens = null;
try { tokens = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { tokens = null; }
let onAuthLost = () => {};
let refreshing = null;

export const getTokens = () => tokens;
export const getAccessToken = () => tokens?.accessToken;
export const setOnAuthLost = (fn) => { onAuthLost = fn; };

export function setTokens(next) {
  tokens = next;
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else localStorage.removeItem(STORAGE_KEY);
}

function refreshTokens() {
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens?.refreshToken }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Session expired');
        setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const send = () =>
    fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth && tokens?.accessToken && { Authorization: `Bearer ${tokens.accessToken}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && auth && tokens?.refreshToken) {
    try {
      await refreshTokens();
      res = await send();
    } catch {
      setTokens(null);
      onAuthLost();
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Something went wrong');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Builds "?a=1&b=2" and skips empty values.
export const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return s ? `?${s}` : '';
};
