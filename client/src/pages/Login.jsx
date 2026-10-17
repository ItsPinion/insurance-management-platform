import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePath } from '../context/session';
import SessionLoader from '../components/SessionLoader';

export default function Login() {
  const { user, status, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setDetails([]);
    setLoading(true);
    try {
      const signedIn = isRegister
        ? await register(name, email, password)
        : await login(email, password);
      navigate(homePath(signedIn), { replace: true });
    } catch (err) {
      const data = err.response?.data;
      if (Array.isArray(data?.details) && data.details.length) {
        setDetails(data.details.map((d) => d.message));
        setError(data.error || 'Validation failed');
      } else if (data?.error) {
        setError(data.error);
      } else if (err.message === 'The server did not return a session.') {
        setError('Sign-in failed: the server did not return a session.');
      } else if (!err.response) {
        setError('Cannot reach the server. Please try again in a moment.');
      } else {
        setError(isRegister ? 'Registration failed' : 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    setDetails([]);
  }

  // a stored session is still being validated
  if (status === 'checking') return <SessionLoader />;

  // an active session never needs the login form
  if (status === 'authenticated' && user) {
    return <Navigate to={homePath(user)} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🛡️</div>
          <h1 className="text-2xl font-bold text-slate-900">InsureDesk</h1>
          <p className="text-slate-600 text-sm">Insurance Management Platform</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">
            {isRegister ? 'Create your account' : 'Sign in to your account'}
          </h2>

          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2"
            >
              <p className="font-medium">{error}</p>
              {details.length > 0 && (
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isRegister && (
            <div>
              <label
                htmlFor="register-name"
                className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1"
              >
                Full name
              </label>
              <input
                id="register-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1"
            >
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1"
            >
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            {isRegister && (
              <p className="text-xs text-slate-500 mt-1">At least 8 characters, including a number.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-md py-2 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Login'}
          </button>

          {isRegister ? (
            <p className="text-xs text-slate-600 text-center">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-slate-900 underline font-medium"
              >
                Sign in
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-600 text-center">
              New customer?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="text-slate-900 underline font-medium"
              >
                Create an account
              </button>
            </p>
          )}

          {!isRegister && (
            <p className="text-xs text-slate-500 text-center">
              Demo: admin@insure.test / Admin@123 · agent@insure.test / Agent@123
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
