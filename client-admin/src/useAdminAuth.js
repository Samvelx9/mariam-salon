import { useState } from 'react';
import { api, setAuthToken, ApiError } from './api.js';

const STORAGE_KEY = 'admin_token';

// setAuthToken() is called synchronously wherever `token` changes below —
// never via a useEffect. On mount, a child screen's own data-fetching effect
// runs before a parent's effect (React runs child effects first), so an
// effect-based approach here would fire the first authenticated request
// before the token was actually attached, get a 401, and immediately log
// back out. Setting it synchronously during the same render/action avoids
// that race entirely.

export function useAdminAuth() {
  const [token, setToken] = useState(() => {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    setAuthToken(stored);
    return stored;
  });
  const [loginError, setLoginError] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  async function login(username, password) {
    setLoggingIn(true);
    setLoginError(false);
    try {
      const { token: newToken } = await api.login(username, password);
      setAuthToken(newToken);
      setToken(newToken);
      try {
        localStorage.setItem(STORAGE_KEY, newToken);
      } catch {
        // localStorage unavailable (private browsing etc) — session still works in-memory
      }
    } catch (err) {
      setLoginError(true);
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setLoggingIn(false);
    }
  }

  function logout() {
    setAuthToken(null);
    setToken(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  // Any 401 from a protected call (expired/invalid token) drops back to login.
  function handleAuthError(err) {
    if (err instanceof ApiError && err.status === 401) {
      logout();
      return true;
    }
    return false;
  }

  return { token, loggedIn: !!token, login, logout, loginError, loggingIn, handleAuthError };
}
