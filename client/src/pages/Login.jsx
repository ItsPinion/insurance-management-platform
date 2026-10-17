import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'CUSTOMER' ? '/my' : '/customers');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🛡️</div>
          <h1 className="text-2xl font-bold text-slate-900">InsureDesk</h1>
          <p className="text-slate-500 text-sm">Insurance Management Platform</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Sign in to your account</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <button
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-md py-2 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Login'}
          </button>

          <p className="text-xs text-slate-400 text-center">
            Demo: admin@insure.test / Admin@123 · agent@insure.test / Agent@123
          </p>
        </form>
      </div>
    </div>
  );
}
