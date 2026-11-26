import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, getAccessToken } from '../api/client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);
export const useSocket = () => useContext(SocketContext);

// One authenticated Socket.IO connection for the whole app while the user is logged in.
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    const s = io(API_URL, { auth: (cb) => cb({ token: getAccessToken() }) });
    setSocket(s);
    return () => { s.close(); setSocket(null); };
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
