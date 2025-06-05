import React, { useState, useEffect } from 'react';
import { useUserSettings } from '@/firebase/hooks/useUserSettings';

export default function UserSettingsForm() {
  const { settings, isLoading, isError, updateSettings, updating } = useUserSettings();
  const [form, setForm] = useState({
    transcriptionLanguage: '',
    audioQuality: '',
    uiTheme: '',
    // Добавьте другие поля по необходимости
  });

  useEffect(() => {
    if (settings) {
      setForm({
        transcriptionLanguage: settings.transcriptionLanguage || '',
        audioQuality: settings.audioQuality || '',
        uiTheme: settings.uiTheme || '',
        // ...
      });
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(form);
  };

  if (isLoading) return <div>Загрузка настроек...</div>;
  if (isError) return <div className="text-red-500">Ошибка загрузки настроек</div>;

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-6 bg-white dark:bg-zinc-900 rounded shadow mt-6">
      <h2 className="text-xl font-bold mb-4">Настройки пользователя</h2>
      <div className="mb-3">
        <label className="block mb-1">Язык транскрипции</label>
        <input
          type="text"
          name="transcriptionLanguage"
          value={form.transcriptionLanguage}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded bg-zinc-100 dark:bg-zinc-800"
        />
      </div>
      <div className="mb-3">
        <label className="block mb-1">Качество аудио</label>
        <select
          name="audioQuality"
          value={form.audioQuality}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded bg-zinc-100 dark:bg-zinc-800"
        >
          <option value="">Выберите</option>
          <option value="low">Низкое</option>
          <option value="medium">Среднее</option>
          <option value="high">Высокое</option>
        </select>
      </div>
      <div className="mb-3">
        <label className="block mb-1">Тема интерфейса</label>
        <select
          name="uiTheme"
          value={form.uiTheme}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded bg-zinc-100 dark:bg-zinc-800"
        >
          <option value="">Системная</option>
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
        </select>
      </div>
      <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={updating}>
        {updating ? 'Сохранение...' : 'Сохранить'}
      </button>
    </form>
  );
}
