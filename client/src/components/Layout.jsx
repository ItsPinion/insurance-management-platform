import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/customers', label: 'Customers', icon: '👥', roles: ['ADMIN', 'AGENT'] },
  // Day 4+: Policies, Claims, Payments, Documents, Dashboard
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-6 h-14 flex items-center gap-3 shadow">
        <span className="text-xl">🛡️</span>
        <span className="font-semibold tracking-wide">InsureDesk</span>
        <span className="flex-1" />
        <span className="text-sm text-slate-300">
          {user?.name} · <span className="uppercase text-xs bg-slate-700 rounded-full px-2 py-0.5">{user?.role}</span>
        </span>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="text-sm bg-slate-700 hover:bg-slate-600 rounded-md px-3 py-1.5"
        >
          Logout
        </button>
      </header>

      <div className="flex">
        <aside className="w-52 min-h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 p-3">
          {NAV.filter((n) => n.roles.includes(user?.role)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm mb-1 ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`
              }
            >
              <span>{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </aside>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
