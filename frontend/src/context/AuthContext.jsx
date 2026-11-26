import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getTokens, setTokens, setOnAuthLost } from '../api/client';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getTokens()));

  const clear = useCallback(() => { setTokens(null); setUser(null); }, []);

  // On first load, restore the session if tokens are stored.
  useEffect(() => {
    setOnAuthLost(clear);
    if (!getTokens()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(clear)
      .finally(() => setLoading(false));
  }, [clear]);

  const handleAuthResponse = (data) => {
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    return data.user;
  };

  const login = async (email, password) => handleAuthResponse(await api('/auth/login', { method: 'POST', body: { email, password }, auth: false }));
  const register = async (form) => handleAuthResponse(await api('/auth/register', { method: 'POST', body: form, auth: false }));
  const logout = async () => {
    const t = getTokens();
    try { await api('/auth/logout', { method: 'POST', body: { refreshToken: t?.refreshToken }, auth: false }); } catch { /* ignore */ }
    clear();
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}
