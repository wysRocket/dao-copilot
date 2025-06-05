import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as Form from '@radix-ui/react-form';

export default function Login() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Ошибка входа');
    }
  };

  return (
    <Form.Root onSubmit={handleSubmit} className="max-w-sm mx-auto p-6 bg-white dark:bg-zinc-900 rounded shadow">
      <h2 className="text-xl font-bold mb-4">Вход</h2>
      <Form.Field name="email" className="mb-3">
        <Form.Label className="block mb-1">Email</Form.Label>
        <Form.Control asChild>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded bg-zinc-100 dark:bg-zinc-800"
            required
          />
        </Form.Control>
      </Form.Field>
      <Form.Field name="password" className="mb-3">
        <Form.Label className="block mb-1">Пароль</Form.Label>
        <Form.Control asChild>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded bg-zinc-100 dark:bg-zinc-800"
            required
          />
        </Form.Control>
      </Form.Field>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <Form.Submit asChild>
        <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={loading}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </Form.Submit>
    </Form.Root>
  );
}
