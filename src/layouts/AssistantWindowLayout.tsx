import React, {useEffect} from 'react';
import {useWindowState} from '../contexts/WindowStateProvider';
import {
  useTranscriptionState,
  useWindowCommunication,
} from '../hooks/useSharedState';
import {
  AssistantNavigationProvider,
  useAssistantNavigation,
} from '../contexts/AssistantNavigationContext';
import {WindowButton} from '../components/ui/window-button';
import {WindowStatus} from '../components/ui/window-status';

// Import page components
import ChatPage from '../pages/assistant/ChatPage';
import TranscriptsPage from '../pages/assistant/TranscriptsPage';
import AnalysisPage from '../pages/assistant/AnalysisPage';
import SettingsPage from '../pages/assistant/SettingsPage';

interface AssistantWindowLayoutProps {
  children?: React.ReactNode;
  initialTab?: 'chat' | 'transcripts' | 'analysis' | 'settings';
}

function AssistantContent() {
  const {currentTab, navigateToTab} = useAssistantNavigation();
  const {windowState, updateLocalState} = useWindowState();
  const {transcripts} = useTranscriptionState();
  const {sendToWindow, onMessage} = useWindowCommunication();

  // Listen for navigation messages from other windows
  useEffect(() => {
    const unsubscribe = onMessage((channel, ...args) => {
      if (channel === 'set-assistant-view' && args[0]) {
        navigateToTab(args[0]);
      }
      if (channel === 'navigate-assistant-tab' && args[0]) {
        navigateToTab(args[0]);
      }
    });

    return unsubscribe;
  }, [onMessage, navigateToTab]);

  // Render current page based on tab
  const renderCurrentPage = () => {
    switch (currentTab) {
      case 'chat':
        return <ChatPage />;
      case 'transcripts':
        return <TranscriptsPage />;
      case 'analysis':
        return <AnalysisPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <ChatPage />;
    }
  };

  // Assistant-specific header with transcription status
  const AssistantHeader = () => (
    <div className="bg-card flex items-center justify-between border-b px-4 py-2">
      <div className="flex items-center space-x-2">
        <div className="h-2 w-2 rounded-full bg-blue-500"></div>
        <span className="text-sm font-medium">AI Assistant</span>
      </div>

      <div className="flex items-center space-x-4">
        <WindowStatus
          showRecordingStatus
          showTranscriptCount
          showWindowInfo={false}
          compact
        />

        {/* Quick actions */}
        <div className="flex space-x-1">
          <WindowButton
            variant="ghost"
            size="icon-sm"
            onClick={() => sendToWindow('main', 'focus-transcription')}
            title="Focus main window"
            className="h-6 w-6"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </WindowButton>

          <WindowButton
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              updateLocalState(
                'sidebarOpen',
                !windowState.localState.sidebarOpen,
              )
            }
            title="Toggle sidebar"
            className="h-6 w-6"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </WindowButton>
        </div>
      </div>
    </div>
  );

  // Assistant-specific footer with tab navigation
  const AssistantFooter = () => (
    <div className="bg-card flex items-center justify-between border-t px-4 py-2">
      <WindowStatus
        showWindowInfo
        showConnectionStatus={false}
        showRecordingStatus={false}
        showTranscriptCount={false}
        compact
      />

      <div className="flex space-x-1">
        <WindowButton
          variant={currentTab === 'chat' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => navigateToTab('chat')}
        >
          💬 Chat
        </WindowButton>
        <WindowButton
          variant={currentTab === 'transcripts' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => navigateToTab('transcripts')}
        >
          📝 Transcripts
        </WindowButton>
        <WindowButton
          variant={currentTab === 'analysis' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => navigateToTab('analysis')}
        >
          📊 Analysis
        </WindowButton>
        <WindowButton
          variant={currentTab === 'settings' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => navigateToTab('settings')}
        >
          ⚙️ Settings
        </WindowButton>
      </div>
    </div>
  );

  return (
    <>
      <AssistantHeader />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {windowState.localState.sidebarOpen && (
          <div className="bg-card/50 w-48 border-r p-3">
            <div className="space-y-2">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Recent Topics
              </div>
              <div className="space-y-1">
                {transcripts.slice(-5).map((transcript) => (
                  <div
                    key={transcript.id}
                    className="hover:bg-accent cursor-pointer rounded p-2 text-xs"
                    onClick={() =>
                      updateLocalState('selectedTranscript', transcript.id)
                    }
                  >
                    {transcript.text.slice(0, 30)}...
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 overflow-auto">{renderCurrentPage()}</div>
      </div>

      <AssistantFooter />
    </>
  );
}

export default function AssistantWindowLayout({
  initialTab = 'transcripts',
}: AssistantWindowLayoutProps) {
  return (
    <AssistantNavigationProvider initialTab={initialTab}>
      <AssistantContent />
    </AssistantNavigationProvider>
  );
}
