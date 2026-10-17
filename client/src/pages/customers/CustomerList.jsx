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
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | customer object

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/customers', { params: { search, page, limit: 10 } });
      setCustomers(data.customers);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load customers');
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-slate-900">Customers</h1>
        <button
          onClick={() => setModal('new')}
          className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-md px-4 py-2"
        >
          + Register customer
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2"
        >
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <label htmlFor="customer-search" className="sr-only">
            Search customers
          </label>
          <input
            id="customer-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="🔍  Search by name, email or phone…"
            className="w-full md:w-80 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[42rem]">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5 text-center">Policies</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No customers found
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{c.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.email}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{c.phone}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="bg-slate-100 rounded-full px-2 py-0.5 text-xs text-slate-700 inline-block">
                        {c._count.policies}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                      <Link to={`/customers/${c.id}`} className="text-slate-900 font-medium underline">
                        View
                      </Link>
                      <button onClick={() => setModal(c)} className="text-slate-600 underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t border-slate-100 text-sm text-slate-600">
          <span>
            {pagination.total} customer{pagination.total === 1 ? '' : 's'}
          </span>
          <div className="space-x-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              aria-label="Previous page"
              className="border border-slate-300 rounded px-2.5 py-1 disabled:opacity-40"
            >
              ‹
            </button>
            <span className="px-2">
              Page {pagination.page} / {pagination.totalPages}
            </span>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              aria-label="Next page"
              className="border border-slate-300 rounded px-2.5 py-1 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {modal && (
        <CustomerFormModal
          customer={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
