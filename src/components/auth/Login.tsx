import React, {useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import * as Form from '@radix-ui/react-form';

export default function Login() {
  const {login, loading} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validateForm = (): string | null => {
    if (!email.trim()) {
      return 'Email is required';
    }
    if (!email.includes('@')) {
      return 'Please enter a valid email';
    }
    if (!password.trim()) {
      return 'Password is required';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate form
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await login(email, password);
      setSuccess('Successfully logged in!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <Form.Root
      onSubmit={handleSubmit}
      className="mx-auto max-w-sm rounded bg-white p-6 shadow dark:bg-zinc-900"
    >
      <h2 className="mb-4 text-xl font-bold">Login</h2>

      {/* Success message */}
      {success && (
        <div className="mb-4 rounded bg-green-100 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {success}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <Form.Field name="email" className="mb-3">
        <Form.Label className="mb-1 block">Email</Form.Label>
        <Form.Control asChild>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border bg-zinc-100 px-3 py-2 dark:bg-zinc-800"
            placeholder="Enter your email"
            required
          />
        </Form.Control>
      </Form.Field>

      <Form.Field name="password" className="mb-3">
        <Form.Label className="mb-1 block">Password</Form.Label>
        <Form.Control asChild>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border bg-zinc-100 px-3 py-2 dark:bg-zinc-800"
            placeholder="Enter your password"
            required
          />
        </Form.Control>
      </Form.Field>

      <Form.Submit asChild>
        <button
          type="submit"
          className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </Form.Submit>
    </Form.Root>
  );
}
