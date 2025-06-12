import React from 'react';

export default function HomePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">DAO Copilot</h1>
          <p className="max-w-md text-gray-600">
            Use the title bar controls to start recording, open the AI
            assistant, or access settings.
          </p>
          <div className="space-y-1 text-sm text-gray-500">
            <p>🎤 Recording Button - Start/Stop recording</p>
            <p>🤖 Ask AI - Open AI Assistant window</p>
            <p>👁️ Show/Hide - Toggle main window visibility</p>
            <p>⚙️ Settings - Open Assistant settings</p>
          </div>
        </div>
      </div>
    </div>
  );
}
