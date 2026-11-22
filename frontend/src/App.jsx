import { useEffect, useState } from 'react';
import { api } from './lib/api.js';

export default function App() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '' });
  const [error, setError] = useState('');

  const load = () => api.listUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createUser(form);
      setForm({ name: '', email: '' });
      load();
    } catch (err) {
      setError(typeof err.message === 'string' ? err.message : 'Failed to create user');
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-3xl font-bold">App Builder</h1>
      <form onSubmit={submit} className="mt-6 flex gap-2">
        <input className="flex-1 rounded border px-3 py-2" placeholder="Name" required
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="flex-1 rounded border px-3 py-2" placeholder="Email" type="email" required
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">Add</button>
      </form>
      {error && <p className="mt-2 text-red-600">{error}</p>}
      <ul className="mt-6 divide-y rounded border">
        {users.map((u) => (
          <li key={u.id} className="p-3">{u.name} <span className="text-gray-500">({u.email})</span></li>
        ))}
        {users.length === 0 && <li className="p-3 text-gray-500">No users yet.</li>}
      </ul>
    </main>
  );
}
