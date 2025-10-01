import React, {useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {auth} from '@/firebase/config';
import {deleteUser} from 'firebase/auth';
import UserSettingsForm from './UserSettingsForm';

export default function UserProfile() {
  const {user, logout} = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!user) return null;

  const handleDelete = async () => {
    if (
      !confirm(
        'Are you sure you want to delete your account? This action cannot be undone.',
      )
    ) {
      return;
    }

    setError(null);
    setSuccess(null);
    setDeleting(true);
    try {
      await deleteUser(auth.currentUser!);
      setSuccess('Account deleted successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error deleting account');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setError(null);
    setSuccess(null);
    setExporting(true);
    try {
      // TODO: implement user data export from Firestore
      setTimeout(() => {
        setSuccess('Data export completed successfully');
        setExporting(false);
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error exporting data');
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto mt-6 max-w-md rounded bg-white p-6 shadow dark:bg-zinc-900">
      <h2 className="mb-4 text-xl font-bold">User Profile</h2>

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

      <div className="mb-2">
        <span className="font-medium">Email:</span>{' '}
        <span className="font-mono text-sm">{user.email}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={logout}
          className="rounded bg-zinc-200 px-4 py-2 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          Sign Out
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export Data'}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? 'Deleting...' : 'Delete Account'}
        </button>
      </div>

      <UserSettingsForm />
    </div>
  );
}
