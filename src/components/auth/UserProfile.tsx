import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/firebase/config';
import { deleteUser } from 'firebase/auth';
import UserSettingsForm from './UserSettingsForm';

export default function UserProfile() {
  const { user, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!user) return null;

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteUser(auth.currentUser!);
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления аккаунта');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    // TODO: реализовать экспорт данных пользователя из Firestore
    setTimeout(() => setExporting(false), 1000);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white dark:bg-zinc-900 rounded shadow mt-6">
      <h2 className="text-xl font-bold mb-4">Профиль пользователя</h2>
      <div className="mb-2">Email: <span className="font-mono">{user.email}</span></div>
      <div className="flex gap-2 mt-4">
        <button onClick={logout} className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700">Выйти</button>
        <button onClick={handleExport} disabled={exporting} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {exporting ? 'Экспорт...' : 'Экспорт данных'}
        </button>
        <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
          {deleting ? 'Удаление...' : 'Удалить аккаунт'}
        </button>
      </div>
      {error && <div className="text-red-500 mt-2">{error}</div>}
      <UserSettingsForm />
    </div>
  );
}
