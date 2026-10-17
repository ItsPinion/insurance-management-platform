import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from '../api/client';
import {
  TOKEN_KEY,
  clearStoredSession,
  fetchSessionUser,
  storeSession,
  updateStoredUser,
} from './session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  // 'checking'  — a stored session is being validated
  // 'authenticated' — a live session
  // 'anonymous'   — no session, the login form is shown
  const [status, setStatus] = useState(() =>
    localStorage.getItem(TOKEN_KEY) ? 'checking' : 'anonymous'
  );

  const endSession = useCallback(() => {
    clearStoredSession();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const startSession = useCallback((session) => {
    if (!session?.token || !session?.user) {
      throw new Error('The server did not return a session.');
    }
    storeSession(session);
    setUser(session.user);
    setStatus('authenticated');
    return session.user;
  }, []);

  // Validate the session that is already in the browser. A stale or revoked
  // token is dropped here, so it can never trap the user on the login screen.
  useEffect(() => {
    if (status !== 'checking') return undefined;
    let cancelled = false;
    fetchSessionUser()
      .then((me) => {
        if (cancelled) return;
        updateStoredUser(me);
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredSession();
        setUser(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // The API rejected our token. Verify it once — the session may still be
  // alive (a single request can be rejected on its own) — and only sign the
  // user out when the token is really gone.
  useEffect(() => {
    let verifying = false;
    setUnauthorizedHandler(async () => {
      if (verifying) return;
      if (!localStorage.getItem(TOKEN_KEY)) return;
      verifying = true;
      let alive = false;
      try {
        const me = await fetchSessionUser();
        alive = true;
        updateStoredUser(me);
        setUser(me);
        setStatus('authenticated');
      } catch {
        alive = false;
      } finally {
        verifying = false;
      }
      if (alive) return;
      endSession();
      navigate('/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession, navigate]);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    return startSession(data);
  }

  async function register(name, email, password) {
    const { data } = await api.post('/auth/register', { name, email, password });
    return startSession(data);
  }

  function logout() {
    endSession();
  }

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
