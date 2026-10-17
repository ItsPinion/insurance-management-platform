import { api } from '../api/client';

export const TOKEN_KEY = 'token';
export const USER_KEY = 'user';

// Customers land on their own profile, staff land on the customer list.
export const homePath = (user) => (user?.role === 'CUSTOMER' ? '/my' : '/customers');

export function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function storeSession(session) {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

// Keeps the cached user in sync with the API response.
export function updateStoredUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Reads the signed-in user from the API. Used to validate a session that is
// already stored in the browser before the app trusts it.
export async function fetchSessionUser() {
  const { data } = await api.get('/auth/me', { skipSessionCheck: true });
  return data.user;
}
