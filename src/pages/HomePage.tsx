import React from 'react';
import {useWindowManager} from '../contexts/AppContext';

export default function HomePage() {
  const {showWindow, hideWindow, visibleWindows} = useWindowManager();

  const handleOpenTitleBar = () => {
    showWindow('titlebar');
  };

  const handleOpenTranscript = () => {
    showWindow('transcript');
  };

  const handleOpenAIAssistant = () => {
    showWindow('ai-assistant');
  };

  const handleCloseTitleBar = () => {
    hideWindow('titlebar');
  };

  const handleCloseTranscript = () => {
    hideWindow('transcript');
  };

  const handleCloseAIAssistant = () => {
    hideWindow('ai-assistant');
  };

  const titleBarState = visibleWindows.has('titlebar');
  const transcriptState = visibleWindows.has('transcript');
  const aiAssistantState = visibleWindows.has('ai-assistant');

  return (
    <div className="flex h-full flex-col p-8">
      <h1 className="mb-8 text-3xl font-bold">
        DAO Copilot - Portal Window Test
      </h1>

      <div className="space-y-6">
        {/* Title Bar Portal Controls */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-4 text-xl font-semibold">Title Bar Portal</h2>
          <p className="mb-4">State: {titleBarState ? 'Open' : 'Closed'}</p>
          <div className="space-x-4">
            <button
              onClick={handleOpenTitleBar}
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              disabled={titleBarState}
            >
              Open Title Bar
            </button>
            <button
              onClick={handleCloseTitleBar}
              className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
              disabled={!titleBarState}
            >
              Close Title Bar
            </button>
          </div>
        </div>

        {/* Transcript Portal Controls */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-4 text-xl font-semibold">Transcript Portal</h2>
          <p className="mb-4">State: {transcriptState ? 'Open' : 'Closed'}</p>
          <div className="space-x-4">
            <button
              onClick={handleOpenTranscript}
              className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
              disabled={transcriptState}
            >
              Open Transcript
            </button>
            <button
              onClick={handleCloseTranscript}
              className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
              disabled={!transcriptState}
            >
              Close Transcript
            </button>
          </div>
        </div>

        {/* AI Assistant Portal Controls */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-4 text-xl font-semibold">AI Assistant Portal</h2>
          <p className="mb-4">State: {aiAssistantState ? 'Open' : 'Closed'}</p>
          <div className="space-x-4">
            <button
              onClick={handleOpenAIAssistant}
              className="rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
              disabled={aiAssistantState}
            >
              Open AI Assistant
            </button>
            <button
              onClick={handleCloseAIAssistant}
              className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
              disabled={!aiAssistantState}
            >
              Close AI Assistant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
