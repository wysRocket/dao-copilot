import React, {useState, useEffect} from 'react';
import {useUserSettings} from '@/firebase/hooks/useUserSettings';
import {UserSettings} from '@/types/user-settings';

export default function UserSettingsForm() {
  const {settings, isLoading, isError, updateSettings, updating} =
    useUserSettings();
  const [form, setForm] = useState<UserSettings>({
    transcriptionLanguage: '',
    audioQuality: 'medium',
    uiTheme: 'system',
  });
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({type: null, message: ''});

  useEffect(() => {
    if (settings) {
      setForm({
        transcriptionLanguage: settings.transcriptionLanguage || '',
        audioQuality: settings.audioQuality || 'medium',
        uiTheme: settings.uiTheme || 'system',
        ...settings,
      });
    }
  }, [settings]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const {name, value} = e.target;
    setForm((prev) => ({...prev, [name]: value}));
    // Clear status when user makes changes
    setSubmitStatus({type: null, message: ''});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus({type: null, message: ''});

    try {
      await updateSettings(form);
      setSubmitStatus({
        type: 'success',
        message: 'Settings saved successfully!',
      });
    } catch (error) {
      console.error('Failed to update settings:', error);
      setSubmitStatus({
        type: 'error',
        message: 'Error saving settings. Please try again.',
      });
    }
  };

  if (isLoading) return <div>Loading settings...</div>;
  if (isError)
    return <div className="text-red-500">Error loading settings</div>;

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-6 max-w-md rounded bg-white p-6 shadow dark:bg-zinc-900"
    >
      <h2 className="mb-4 text-xl font-bold">User Settings</h2>

      {/* Status message */}
      {submitStatus.type && (
        <div
          className={`mb-4 rounded p-3 text-sm ${
            submitStatus.type === 'success'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          }`}
        >
          {submitStatus.message}
        </div>
      )}

      <div className="mb-3">
        <label htmlFor="transcriptionLanguage" className="mb-1 block">
          Transcription Language
        </label>
        <input
          id="transcriptionLanguage"
          type="text"
          name="transcriptionLanguage"
          value={form.transcriptionLanguage || ''}
          onChange={handleChange}
          placeholder="Example: ru-RU, en-US"
          className="w-full rounded border bg-zinc-100 px-3 py-2 dark:bg-zinc-800"
        />
      </div>
      <div className="mb-3">
        <label htmlFor="audioQuality" className="mb-1 block">
          Audio Quality
        </label>
        <select
          id="audioQuality"
          name="audioQuality"
          value={form.audioQuality || 'medium'}
          onChange={handleChange}
          className="w-full rounded border bg-zinc-100 px-3 py-2 dark:bg-zinc-800"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="mb-3">
        <label htmlFor="uiTheme" className="mb-1 block">
          UI Theme
        </label>
        <select
          id="uiTheme"
          name="uiTheme"
          value={form.uiTheme || 'system'}
          onChange={handleChange}
          className="w-full rounded border bg-zinc-100 px-3 py-2 dark:bg-zinc-800"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <button
        type="submit"
        className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={updating}
      >
        {updating ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
