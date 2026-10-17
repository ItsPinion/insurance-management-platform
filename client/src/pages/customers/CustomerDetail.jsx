import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/customers/${id}/history`)
      .then(({ data }) => setCustomer(data.customer))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load customer'));
  }, [id]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!customer) return <div className="text-slate-400">Loading…</div>;

  const claims = customer.policies.flatMap((p) =>
    p.claims.map((c) => ({ ...c, policyNumber: p.policyNumber }))
  );
  const payments = customer.policies.flatMap((p) =>
    p.payments.map((pay) => ({ ...pay, policyNumber: p.policyNumber }))
  );

  const card = 'bg-white rounded-xl shadow p-5';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/customers" className="text-slate-500 text-sm underline">← Customers</Link>
        <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
      </div>

      <div className={card}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Profile</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-slate-400 text-xs">Email</p>{customer.email}</div>
          <div><p className="text-slate-400 text-xs">Phone</p>{customer.phone}</div>
          <div><p className="text-slate-400 text-xs">Date of birth</p>{fmtDate(customer.dob)}</div>
          <div><p className="text-slate-400 text-xs">Address</p>{customer.address}</div>
        </div>
      </div>

      <div className={card}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Policies ({customer.policies.length})
        </h2>
        {customer.policies.length === 0 ? (
          <p className="text-sm text-slate-400">No policies yet — created from the Policies module (Day 4).</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500">
              <th className="py-1.5">Policy #</th><th>Type</th><th>Premium</th><th>Ends</th><th>Status</th>
            </tr></thead>
            <tbody>{customer.policies.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{p.policyNumber}</td>
                <td>{p.policyType}</td>
                <td>${Number(p.premiumAmount).toFixed(2)}</td>
                <td>{fmtDate(p.endDate)}</td>
                <td><span className="bg-slate-100 rounded-full px-2 py-0.5 text-xs">{p.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className={card}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Claims ({claims.length})
          </h2>
          {claims.length === 0
            ? <p className="text-sm text-slate-400">No claims yet.</p>
            : claims.map((c) => (
              <div key={c.id} className="border-t border-slate-100 py-2 text-sm flex justify-between">
                <span>{c.claimNumber} · {c.policyNumber}</span>
                <span className="bg-slate-100 rounded-full px-2 py-0.5 text-xs">{c.status}</span>
              </div>
            ))}
        </div>

        <div className={card}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Payments ({payments.length})
          </h2>
          {payments.length === 0
            ? <p className="text-sm text-slate-400">No payments yet.</p>
            : payments.map((p) => (
              <div key={p.id} className="border-t border-slate-100 py-2 text-sm flex justify-between">
                <span>{p.policyNumber} · ${Number(p.amount).toFixed(2)} · due {fmtDate(p.dueDate)}</span>
                <span className="bg-slate-100 rounded-full px-2 py-0.5 text-xs">{p.paymentStatus}</span>
              </div>
            ))}
        </div>
      </div>

      <div className={card}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Documents ({customer.documents.length})
        </h2>
        {customer.documents.length === 0
          ? <p className="text-sm text-slate-400">No documents yet — uploads arrive with Day 7.</p>
          : customer.documents.map((d) => (
            <div key={d.id} className="border-t border-slate-100 py-2 text-sm">📄 {d.fileName}</div>
          ))}
      </div>
    </div>
  );
}
