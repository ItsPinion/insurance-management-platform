import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/customers', label: 'Customers', icon: '👥', roles: ['ADMIN', 'AGENT'] },
  // Day 4+: Policies, Claims, Payments, Documents, Dashboard
];

const navLinkClass = (isActive) =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-sm mb-1 ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
  }`;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = NAV.filter((n) => n.roles.includes(user?.role));

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-4 sm:px-6 h-14 flex items-center gap-3 shadow">
        <span className="text-xl leading-none">🛡️</span>
        <span className="font-semibold tracking-wide whitespace-nowrap">InsureDesk</span>
        <span className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="text-sm text-slate-300 truncate">{user?.name}</span>
          <span className="uppercase text-xs bg-slate-700 text-slate-100 rounded-full px-2 py-0.5 shrink-0">
            {user?.role}
          </span>
        </span>
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="text-sm bg-slate-700 hover:bg-slate-600 rounded-md px-3 py-1.5 whitespace-nowrap shrink-0"
        >
          Logout
        </button>
      </header>

      <div className="flex flex-col md:flex-row">
        {/* Desktop sidebar — only when the role has navigation entries */}
        {items.length > 0 && (
          <aside className="hidden md:block w-52 shrink-0 min-h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 p-3">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => navLinkClass(isActive)}>
                <span>{n.icon}</span> {n.label}
              </NavLink>
            ))}
          </aside>
        )}

        {/* Mobile navigation strip */}
        {items.length > 0 && (
          <nav className="md:hidden w-full shrink-0 bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                <span>{n.icon}</span> {n.label}
              </NavLink>
            ))}
          </nav>
        )}

        <main className="flex-1 min-w-0 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
