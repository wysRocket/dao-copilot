import React, {useState} from 'react';
import {useWindowState} from '../../contexts/WindowStateProvider';

export default function SettingsPage() {
  const {windowState, updateLocalState} = useWindowState();
  const [settings, setSettings] = useState({
    theme: 'auto',
    language: 'en',
    autoSave: true,
    notifications: true,
    aiModel: 'gpt-3.5-turbo',
    transcriptionQuality: 'high',
  });

  const handleSettingChange = (key: string, value: any) => {
    setSettings((prev) => ({...prev, [key]: value}));
    // TODO: Persist settings to storage
  };

  const handleSave = () => {
    // TODO: Save settings to persistent storage
    console.log('Saving settings:', settings);
  };

  return (
    <div className="max-w-2xl p-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-muted-foreground text-sm">
          Configure your assistant preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Appearance Settings */}
        <div className="space-y-3">
          <h3 className="text-md font-medium">Appearance</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Theme</label>
              <select
                value={settings.theme}
                onChange={(e) => handleSettingChange('theme', e.target.value)}
                className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Language</label>
              <select
                value={settings.language}
                onChange={(e) =>
                  handleSettingChange('language', e.target.value)
                }
                className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </div>
          </div>
        </div>

        {/* Transcription Settings */}
        <div className="space-y-3">
          <h3 className="text-md font-medium">Transcription</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Quality</label>
              <select
                value={settings.transcriptionQuality}
                onChange={(e) =>
                  handleSettingChange('transcriptionQuality', e.target.value)
                }
                className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="standard">Standard</option>
                <option value="high">High Quality</option>
                <option value="enhanced">Enhanced</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">AI Model</label>
              <select
                value={settings.aiModel}
                onChange={(e) => handleSettingChange('aiModel', e.target.value)}
                className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="gpt-4">GPT-4</option>
                <option value="claude-3">Claude 3</option>
              </select>
            </div>
          </div>
        </div>

        {/* Behavior Settings */}
        <div className="space-y-3">
          <h3 className="text-md font-medium">Behavior</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">
                  Auto-save transcripts
                </label>
                <p className="text-muted-foreground text-xs">
                  Automatically save transcripts to disk
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoSave}
                onChange={(e) =>
                  handleSettingChange('autoSave', e.target.checked)
                }
                className="rounded"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">
                  Show notifications
                </label>
                <p className="text-muted-foreground text-xs">
                  Get notified about transcription events
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) =>
                  handleSettingChange('notifications', e.target.checked)
                }
                className="rounded"
              />
            </div>
          </div>
        </div>

        {/* Window Settings */}
        <div className="space-y-3">
          <h3 className="text-md font-medium">Window</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Sidebar open</label>
                <p className="text-muted-foreground text-xs">
                  Show sidebar by default
                </p>
              </div>
              <input
                type="checkbox"
                checked={windowState.localState.sidebarOpen || false}
                onChange={(e) =>
                  updateLocalState('sidebarOpen', e.target.checked)
                }
                className="rounded"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="border-t pt-4">
          <button
            onClick={handleSave}
            className="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
