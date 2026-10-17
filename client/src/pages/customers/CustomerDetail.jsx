import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

const badge =
  'bg-slate-100 rounded-full px-2 py-0.5 text-xs text-slate-700 whitespace-nowrap shrink-0';

export default function CustomerDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  // the loaded record keeps its id, so switching to another customer shows the
  // loading state again without resetting the state inside the effect
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState(null);

  // only staff can go back to the customer list — a customer has no list access
  const canGoBack = user?.role === 'ADMIN' || user?.role === 'AGENT';

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/customers/${id}/history`)
      .then(({ data }) => {
        if (cancelled) return;
        setLoaded({ id, customer: data.customer });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError({ id, message: err.response?.data?.error || 'Failed to load customer' });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error?.id === id) {
    return (
      <div
        role="alert"
        className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"
      >
        {error.message}
      </div>
    );
  }
  if (loaded?.id !== id) return <div className="text-slate-500">Loading…</div>;

  const customer = loaded.customer;

  const claims = customer.policies.flatMap((p) =>
    p.claims.map((c) => ({ ...c, policyNumber: p.policyNumber }))
  );
  const payments = customer.policies.flatMap((p) =>
    p.payments.map((pay) => ({ ...pay, policyNumber: p.policyNumber }))
  );

  const card = 'bg-white rounded-xl shadow p-5';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {canGoBack && (
          <Link to="/customers" className="text-slate-600 text-sm underline">
            ← Customers
          </Link>
        )}
        <h1 className="text-xl font-bold text-slate-900 break-words">{customer.name}</h1>
      </div>

      <div className={card}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="min-w-0">
            <p className="text-slate-500 text-xs">Email</p>
            <p className="break-words text-slate-800">{customer.email}</p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-xs">Phone</p>
            <p className="break-words text-slate-800">{customer.phone}</p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-xs">Date of birth</p>
            <p className="text-slate-800">{fmtDate(customer.dob)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-xs">Address</p>
            <p className="break-words text-slate-800">{customer.address}</p>
          </div>
        </div>
      </div>

      <div className={card}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">
          Policies ({customer.policies.length})
        </h2>
        {customer.policies.length === 0 ? (
          <p className="text-sm text-slate-500">No policies yet — created from the Policies module (Day 4).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-600">
                  <th className="py-1.5">Policy #</th>
                  <th>Type</th>
                  <th>Premium</th>
                  <th>Ends</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {customer.policies.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium whitespace-nowrap">{p.policyNumber}</td>
                    <td>{p.policyType}</td>
                    <td className="whitespace-nowrap">${Number(p.premiumAmount).toFixed(2)}</td>
                    <td className="whitespace-nowrap">{fmtDate(p.endDate)}</td>
                    <td>
                      <span className={badge}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className={card}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">
            Claims ({claims.length})
          </h2>
          {claims.length === 0 ? (
            <p className="text-sm text-slate-500">No claims yet.</p>
          ) : (
            claims.map((c) => (
              <div key={c.id} className="border-t border-slate-100 py-2 text-sm flex justify-between gap-3">
                <span className="min-w-0 break-words">
                  {c.claimNumber} · {c.policyNumber}
                </span>
                <span className={badge}>{c.status}</span>
              </div>
            ))
          )}
        </div>

        <div className={card}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">
            Payments ({payments.length})
          </h2>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500">No payments yet.</p>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="border-t border-slate-100 py-2 text-sm flex justify-between gap-3">
                <span className="min-w-0 break-words">
                  {p.policyNumber} · ${Number(p.amount).toFixed(2)} · due {fmtDate(p.dueDate)}
                </span>
                <span className={badge}>{p.paymentStatus}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={card}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">
          Documents ({customer.documents.length})
        </h2>
        {customer.documents.length === 0 ? (
          <p className="text-sm text-slate-500">No documents yet — uploads arrive with Day 7.</p>
        ) : (
          customer.documents.map((d) => (
            <div key={d.id} className="border-t border-slate-100 py-2 text-sm break-words">
              📄 {d.fileName}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
