import React, {useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import * as Form from '@radix-ui/react-form';

export default function Register() {
  const {register, loading} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validateForm = (): string | null => {
    if (!email.trim()) {
      return 'Email is required';
    }
    if (!email.includes('@') || !email.includes('.')) {
      return 'Please enter a valid email address';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match';
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
      await register(email, password);
      setSuccess('Account successfully created!');
      // Clear form
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <Form.Root
      onSubmit={handleSubmit}
      className="mx-auto max-w-sm rounded bg-white p-6 shadow dark:bg-zinc-900"
    >
      <h2 className="mb-4 text-xl font-bold">Register</h2>

      {/* Success message */}
      {success && (
        <div
          className="mb-4 rounded bg-green-100 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400"
          role="alert"
          aria-live="polite"
        >
          {success}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          className="mb-4 rounded bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      )}

      <Form.Field name="email" className="mb-3">
        <Form.Label className="mb-1 block">Email Address</Form.Label>
        <Form.Control asChild>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border bg-zinc-100 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none dark:bg-zinc-800 dark:focus:border-blue-400 dark:focus:ring-blue-800"
            placeholder="Enter your email address"
            required
            aria-describedby="email-help"
            autoComplete="email"
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
            className="w-full rounded border bg-zinc-100 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none dark:bg-zinc-800 dark:focus:border-blue-400 dark:focus:ring-blue-800"
            placeholder="Minimum 6 characters"
            required
            minLength={6}
            aria-describedby="password-help"
            autoComplete="new-password"
          />
        </Form.Control>
        <div
          id="password-help"
          className="mt-1 text-xs text-gray-500 dark:text-gray-400"
        >
          Password must be at least 6 characters long
        </div>
      </Form.Field>

      <Form.Field name="confirmPassword" className="mb-3">
        <Form.Label className="mb-1 block">Confirm Password</Form.Label>
        <Form.Control asChild>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded border bg-zinc-100 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none dark:bg-zinc-800 dark:focus:border-blue-400 dark:focus:ring-blue-800"
            placeholder="Repeat your password"
            required
            aria-describedby="confirm-password-help"
            autoComplete="new-password"
          />
        </Form.Control>
        <div
          id="confirm-password-help"
          className="mt-1 text-xs text-gray-500 dark:text-gray-400"
        >
          Must match the password above
        </div>
      </Form.Field>

      <Form.Submit asChild>
        <button
          type="submit"
          className="w-full rounded bg-blue-600 py-2 text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-900"
          disabled={loading}
          aria-describedby="submit-help"
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </Form.Submit>

      <div
        id="submit-help"
        className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400"
      >
        By creating an account, you agree to our terms of service
      </div>
    </Form.Root>
  );
}
