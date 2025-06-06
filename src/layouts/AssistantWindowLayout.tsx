import React from 'react';
import { useWindowState } from '../contexts/WindowStateProvider';
import { useTranscriptionState, useWindowCommunication } from '../hooks/useSharedState';
import WindowLayout from './WindowLayout';
import { WindowButton } from '../components/ui/window-button';
import { WindowStatus } from '../components/ui/window-status';

interface AssistantWindowLayoutProps {
  children: React.ReactNode;
}

export default function AssistantWindowLayout({ children }: AssistantWindowLayoutProps) {
  const { windowState, updateLocalState } = useWindowState();
  const { transcripts, isRecording } = useTranscriptionState();
  const { sendToWindow } = useWindowCommunication();

  // Assistant-specific header with transcription status
  const AssistantHeader = () => (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
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
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </WindowButton>
          
          <WindowButton
            variant="ghost"
            size="icon-sm"
            onClick={() => updateLocalState('sidebarOpen', !windowState.localState.sidebarOpen)}
            title="Toggle sidebar"
            className="h-6 w-6"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </WindowButton>
        </div>
      </div>
    </div>
  );

  // Assistant-specific footer with quick actions
  const AssistantFooter = () => (
    <div className="flex items-center justify-between px-4 py-2 border-t bg-card">
      <WindowStatus 
        showWindowInfo 
        showConnectionStatus={false}
        showRecordingStatus={false}
        showTranscriptCount={false}
        compact 
      />
      
      <div className="flex space-x-1">
        <WindowButton
          variant={windowState.localState.currentView === 'chat' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => updateLocalState('currentView', 'chat')}
        >
          💬 Chat
        </WindowButton>
        <WindowButton
          variant={windowState.localState.currentView === 'transcripts' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => updateLocalState('currentView', 'transcripts')}
        >
          📝 Transcripts
        </WindowButton>
        <WindowButton
          variant={windowState.localState.currentView === 'analysis' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => updateLocalState('currentView', 'analysis')}
        >
          📊 Analysis
        </WindowButton>
      </div>
    </div>
  );

  return (
    <WindowLayout 
      padding="p-0" 
      className="flex flex-col"
    >
      <AssistantHeader />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {windowState.localState.sidebarOpen && (
          <div className="w-48 border-r bg-card/50 p-3">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Recent Topics
              </div>
              <div className="space-y-1">
                {transcripts.slice(-5).map((transcript, index) => (
                  <div
                    key={transcript.id}
                    className="p-2 text-xs rounded hover:bg-accent cursor-pointer"
                    onClick={() => updateLocalState('selectedTranscript', transcript.id)}
                  >
                    {transcript.text.slice(0, 30)}...
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Main content area */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
      
      <AssistantFooter />
    </WindowLayout>
  );
}