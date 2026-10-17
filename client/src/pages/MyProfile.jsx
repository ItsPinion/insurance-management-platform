import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Landing screen for a CUSTOMER account.
 *
 * The API only exposes a customer's own profile, so the linked customer id is
 * resolved from /api/auth/me and the regular customer detail screen is used.
 * A self-registered account has no customer profile yet — an agent creates it
 * (FR-2.1) — which is why an empty state is handled here.
 */
export default function MyProfile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState(null);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);

  // the session already carries the link once it has been validated
  const linkedId = user?.customer?.id;

  useEffect(() => {
    // the validated session already carries the link
    if (linkedId) return undefined;
    let cancelled = false;
    api
      .get('/auth/me')
      .then(({ data }) => {
        if (cancelled) return;
        const id = data.user?.customer?.id;
        if (id) setCustomerId(id);
        setError('');
        setChecked(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.error || 'Failed to load your profile');
        setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedId]);

  if (linkedId) return <Navigate to={`/customers/${linkedId}`} replace />;
  if (error) {
    return (
      <div
        role="alert"
        className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"
      >
        {error}
      </div>
    );
  }
  if (!checked) return <div className="text-slate-500">Loading…</div>;
  if (customerId) return <Navigate to={`/customers/${customerId}`} replace />;

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold text-slate-900 mb-3">Welcome, {user?.name}</h1>
      <div className="bg-white rounded-xl shadow p-6 space-y-3">
        <p className="text-sm text-slate-600">
          Your account is ready. A customer profile is created by an agent or administrator, so there
          is no policy, claim or payment to show on your account yet.
        </p>
        <p className="text-sm text-slate-600">
          As soon as an administrator links a customer profile to{' '}
          <span className="font-medium text-slate-800">{user?.email}</span>, your policies,
          claims and payments appear here.
        </p>
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="mt-2 border border-slate-300 rounded-md px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
