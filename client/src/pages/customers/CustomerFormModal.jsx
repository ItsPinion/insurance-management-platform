import { useState } from 'react';
import { api } from '../../api/client';

const EMPTY = { name: '', email: '', phone: '', dob: '', address: '' };

export default function CustomerFormModal({ customer, onClose, onSaved }) {
  const editing = Boolean(customer);
  const [form, setForm] = useState(
    editing ? { ...customer, dob: customer.dob?.slice(0, 10) } : EMPTY
  );
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setErrors({});
    setApiError('');
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        dob: form.dob,
        address: form.address,
      };
      if (editing) await api.put(`/customers/${customer.id}`, payload);
      else await api.post('/customers', payload);
      onSaved();
    } catch (err) {
      const d = err.response?.data;
      if (d?.details) {
        setErrors(Object.fromEntries(d.details.map((x) => [x.field, x.message])));
      } else {
        setApiError(d?.error || 'Something went wrong');
      }
    } finally {
      setSaving(false);
    }
  }

  const field = (label, key, type = 'text', props = {}) => (
    <div>
      <label
        htmlFor={`customer-${key}`}
        className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1"
      >
        {label}
      </label>
      <input
        id={`customer-${key}`}
        name={key}
        type={type}
        value={form[key] ?? ''}
        onChange={set(key)}
        className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 ${
          errors[key] ? 'border-red-400' : 'border-slate-300'
        }`}
        {...props}
      />
      {errors[key] && (
        <p className="text-xs text-red-600 mt-1">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-semibold text-slate-900 text-lg">
          {editing ? `Edit customer — ${customer.name}` : 'Register customer'}
        </h2>

        {apiError && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2"
          >
            {apiError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('Full name', 'name')}
          {field('Email', 'email', 'email')}
          {field('Phone', 'phone', 'tel')}
          {field('Date of birth', 'dob', 'date')}
        </div>
        {field('Address', 'address')}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="border border-slate-300 rounded-md px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Register'}
          </button>
        </div>
      </form>
    </div>
  );
}
