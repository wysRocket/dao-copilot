import React, { useState } from 'react';
import { AuthForm } from './components/ui/AuthForm';
import { ProfileForm } from './components/ui/ProfileForm';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <AuthForm mode={mode} onAuthSuccess={setToken} />
        <button
          className="mt-4 text-blue-600 underline"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    );
  }

  return (
    <ProfileForm token={token} onLogout={() => setToken(null)} />
  );
};

export default App;
