import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

// The auth context owns the session. When the API rejects our token the
// context decides what happens next (it verifies the session once before
// ending it) — the interceptor must never throw the user back to the login
// screen on its own.
let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 means the token was rejected. The auth context re-checks the session
// and only signs the user out when the token is really gone, so a single
// rejected request can no longer end a fresh sign-in.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.skipSessionCheck) {
      unauthorizedHandler?.();
    }
    return Promise.reject(err);
  }
);
