import React, { useState, useEffect } from 'react';

interface ProfileFormProps {
  token: string;
  onLogout: () => void;
}

export const ProfileForm: React.FC<ProfileFormProps> = ({ token, onLogout }) => {
  const [profile, setProfile] = useState<{ email: string; displayName?: string } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Получить профиль пользователя
  useEffect(() => {
    setLoading(true);
    fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=YOUR_FIREBASE_API_KEY', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.users && data.users[0]) {
          setProfile(data.users[0]);
          setName(data.users[0].displayName || '');
          setEmail(data.users[0].email);
        }
      })
      .catch(() => setError('Ошибка загрузки профиля'))
      .finally(() => setLoading(false));
  }, [token]);

  // Обновить профиль
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:update?key=YOUR_FIREBASE_API_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: token,
          displayName: name,
          email,
          returnSecureToken: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Ошибка обновления');
      setSuccess('Профиль обновлен!');
      setProfile({ ...profile!, displayName: name, email });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !profile) return <div>Загрузка...</div>;

  return (
    <form onSubmit={handleUpdate} className="flex flex-col gap-4 max-w-sm mx-auto p-4 border rounded mt-8">
      <h2 className="text-xl font-bold mb-2">Профиль</h2>
      <input
        type="text"
        placeholder="Имя"
        value={name}
        onChange={e => setName(e.target.value)}
        className="border p-2 rounded"
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="border p-2 rounded"
      />
      {error && <div className="text-red-500">{error}</div>}
      {success && <div className="text-green-600">{success}</div>}
      <button type="submit" className="bg-blue-600 text-white p-2 rounded" disabled={loading}>
        {loading ? 'Сохраняю...' : 'Сохранить'}
      </button>
      <button type="button" className="bg-gray-300 px-4 py-2 rounded" onClick={onLogout}>
        Выйти
      </button>
    </form>
  );
};
