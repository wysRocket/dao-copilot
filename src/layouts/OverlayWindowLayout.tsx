import React from 'react';
import { useWindowState } from '../contexts/WindowStateProvider';
import { useTranscriptionState, useWindowCommunication } from '../hooks/useSharedState';

interface OverlayWindowLayoutProps {
  children: React.ReactNode;
}

export default function OverlayWindowLayout({ children }: OverlayWindowLayoutProps) {
  const { windowState, hideWindow, updateLocalState } = useWindowState();
  const { isRecording, transcripts } = useTranscriptionState();
  const { sendToWindow, broadcast } = useWindowCommunication();

  const isPinned = windowState.localState.pinned || false;
  const isMinimized = windowState.localState.minimized || false;

  return (
    <div className="h-full w-full bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg overflow-hidden">
      {/* Overlay header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-card/80">
        <div className="flex items-center space-x-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`}></div>
          <span className="text-xs font-medium">Quick Access</span>
        </div>
        
        <div className="flex items-center space-x-1">
          {/* Pin button */}
          <button
            onClick={() => updateLocalState('pinned', !isPinned)}
            className={`w-3 h-3 rounded-sm text-xs flex items-center justify-center ${
              isPinned ? 'bg-blue-500 text-white' : 'hover:bg-accent'
            }`}
            title="Pin overlay"
          >
            📌
          </button>
          
          {/* Minimize button */}
          <button
            onClick={() => updateLocalState('minimized', !isMinimized)}
            className="w-3 h-3 rounded-sm bg-yellow-500 hover:bg-yellow-600 text-white text-xs flex items-center justify-center"
            title="Minimize"
          >
            —
          </button>
          
          {/* Close button */}
          <button
            onClick={hideWindow}
            className="w-3 h-3 rounded-sm bg-red-500 hover:bg-red-600 text-white text-xs flex items-center justify-center"
            title="Close overlay"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Overlay content */}
      {!isMinimized && (
        <div className="flex-1 p-2">
          {/* Quick stats */}
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>{transcripts.length} transcripts</span>
            <span>{isRecording ? 'Recording...' : 'Ready'}</span>
          </div>
          
          {/* Main content */}
          <div className="space-y-1">
            {children}
          </div>
          
          {/* Quick actions */}
          <div className="mt-2 pt-2 border-t space-y-1">
            <button
              onClick={() => sendToWindow('main', 'toggle-recording')}
              className={`w-full px-2 py-1 text-xs rounded text-left ${
                isRecording 
                  ? 'bg-red-100 text-red-800 hover:bg-red-200' 
                  : 'bg-green-100 text-green-800 hover:bg-green-200'
              }`}
            >
              {isRecording ? '⏸️ Stop Recording' : '🎤 Start Recording'}
            </button>
            
            <button
              onClick={() => broadcast('show-transcripts')}
              className="w-full px-2 py-1 text-xs hover:bg-accent rounded text-left"
            >
              📝 Show Transcripts
            </button>
            
            <button
              onClick={() => sendToWindow('main', 'focus-window')}
              className="w-full px-2 py-1 text-xs hover:bg-accent rounded text-left"
            >
              🔍 Focus Main
            </button>
          </div>
        </div>
      )}
      
      {/* Minimized state */}
      {isMinimized && (
        <div className="p-2 text-center">
          <div className="text-xs text-muted-foreground">
            {isRecording ? '🔴' : '⚪'} {transcripts.length}
          </div>
        </div>
      )}
    </div>
  );
}