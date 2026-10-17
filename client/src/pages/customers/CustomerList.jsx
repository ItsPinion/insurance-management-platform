import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import CustomerFormModal from './CustomerFormModal';

export default function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | customer object

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/customers', { params: { search, page, limit: 10 } });
      setCustomers(data.customers);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0); // debounce typing
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">Customers</h1>
        <button
          onClick={() => setModal('new')}
          className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-md px-4 py-2"
        >
          + Register customer
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="🔍  Search by name, email or phone…"
            className="w-full md:w-80 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5 text-center">Policies</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No customers found</td></tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.email}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.phone}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="bg-slate-100 rounded-full px-2 py-0.5 text-xs">{c._count.policies}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-3">
                    <Link to={`/customers/${c.id}`} className="text-slate-900 font-medium underline">View</Link>
                    <button onClick={() => setModal(c)} className="text-slate-500 underline">Edit</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between p-3 border-t border-slate-100 text-sm text-slate-500">
          <span>{pagination.total} customer{pagination.total === 1 ? '' : 's'}</span>
          <div className="space-x-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="border border-slate-300 rounded px-2.5 py-1 disabled:opacity-40"
            >‹</button>
            <span className="px-2">Page {pagination.page} / {pagination.totalPages}</span>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              className="border border-slate-300 rounded px-2.5 py-1 disabled:opacity-40"
            >›</button>
          </div>
        </div>
      </div>

      {modal && (
        <CustomerFormModal
          customer={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
