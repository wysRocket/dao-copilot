import React, { useState } from 'react';

interface AuthFormProps {
  mode: 'login' | 'register';
  onAuthSuccess: (token: string) => void;
}

export const AuthForm: React.FC<AuthFormProps> = ({ mode, onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const url =
        mode === 'register'
          ? 'http://localhost:4000/auth/register'
          : 'http://localhost:4000/auth/login';
      const body =
        mode === 'register'
          ? { email, password, name }
          : { email, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auth error');
      if (mode === 'login') {
        onAuthSuccess(data.idToken);
      } else {
        // После регистрации можно сразу залогинить пользователя
        onAuthSuccess('registered');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleZoomLogin = () => {
    const clientId = 'YOUR_ZOOM_CLIENT_ID'; // TODO: заменить на реальный client_id
    const redirectUri = window.location.origin + '/';
    const zoomAuthUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = zoomAuthUrl;
  };

  // Обработка редиректа с кодом Zoom OAuth
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      // Обмениваем code на токен через backend
      fetch('http://localhost:4000/auth/oauth/zoom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri: window.location.origin + '/' }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.access_token) {
            onAuthSuccess(data.access_token);
          }
        });
    }
  }, [onAuthSuccess]);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm mx-auto p-4 border rounded">
      <h2 className="text-xl font-bold mb-2">{mode === 'login' ? 'Вход' : 'Регистрация'}</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="border p-2 rounded"
      />
      {mode === 'register' && (
        <input
          type="text"
          placeholder="Имя"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className="border p-2 rounded"
        />
      )}
      <input
        type="password"
        placeholder="Пароль"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        className="border p-2 rounded"
      />
      {error && <div className="text-red-500">{error}</div>}
      <button type="submit" className="bg-blue-600 text-white p-2 rounded" disabled={loading}>
        {loading ? 'Загрузка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
      </button>
      <button
        type="button"
        className="bg-gray-800 text-white p-2 rounded mt-2"
        onClick={handleZoomLogin}
        disabled={loading}
      >
        Войти через Zoom
      </button>
    </form>
  );
};
