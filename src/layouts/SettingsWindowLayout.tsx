import React from 'react';
import { useWindowState } from '../contexts/WindowStateProvider';
import { useSettingsState, useWindowCommunication } from '../hooks/useSharedState';
import WindowLayout from './WindowLayout';

interface SettingsWindowLayoutProps {
  children: React.ReactNode;
}

export default function SettingsWindowLayout({ children }: SettingsWindowLayoutProps) {
  const { windowState, updateLocalState } = useWindowState();
  const { settings } = useSettingsState();
  const { sendToWindow } = useWindowCommunication();

  // Settings navigation tabs
  const settingsTabs = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'audio', label: 'Audio', icon: '🎤' },
    { id: 'transcription', label: 'Transcription', icon: '📝' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'advanced', label: 'Advanced', icon: '🔧' },
  ];

  const currentTab = windowState.localState.currentView || 'general';

  // Settings header with navigation
  const SettingsHeader = () => (
    <div className="border-b bg-card">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-sm font-medium">Settings</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => sendToWindow('main', 'settings-opened')}
            className="p-1 rounded hover:bg-accent text-xs"
            title="Notify main window"
          >
            📡
          </button>
          
          <button
            onClick={() => updateLocalState('searchQuery', '')}
            className="p-1 rounded hover:bg-accent text-xs"
            title="Clear search"
          >
            🗑️
          </button>
        </div>
      </div>
      
      {/* Search bar */}
      <div className="px-4 pb-3">
        <input
          type="text"
          placeholder="Search settings..."
          value={windowState.localState.searchQuery || ''}
          onChange={(e) => updateLocalState('searchQuery', e.target.value)}
          className="w-full px-3 py-1.5 text-sm border rounded-md bg-background"
        />
      </div>
      
      {/* Navigation tabs */}
      <div className="flex border-t">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => updateLocalState('currentView', tab.id)}
            className={`flex-1 px-2 py-2 text-xs flex items-center justify-center space-x-1 border-r last:border-r-0 ${
              currentTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // Settings footer with actions
  const SettingsFooter = () => (
    <div className="flex items-center justify-between px-4 py-3 border-t bg-card">
      <div className="flex items-center space-x-2 text-xs text-muted-foreground">
        <span>Unsaved changes: {Object.keys(windowState.localState.formData || {}).length}</span>
      </div>
      
      <div className="flex space-x-2">
        <button
          onClick={() => {
            updateLocalState('formData', {});
            sendToWindow('main', 'settings-reset');
          }}
          className="px-3 py-1.5 text-xs border rounded hover:bg-accent"
        >
          Reset
        </button>
        
        <button
          onClick={() => {
            // Apply settings
            const formData = windowState.localState.formData || {};
            sendToWindow('main', 'settings-apply', formData);
            updateLocalState('formData', {});
          }}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          disabled={!Object.keys(windowState.localState.formData || {}).length}
        >
          Apply
        </button>
        
        <button
          onClick={() => {
            // Save and apply settings
            const formData = windowState.localState.formData || {};
            sendToWindow('main', 'settings-save', formData);
            updateLocalState('formData', {});
          }}
          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          disabled={!Object.keys(windowState.localState.formData || {}).length}
        >
          Save
        </button>
      </div>
    </div>
  );

  return (
    <WindowLayout 
      padding="p-0" 
      className="flex flex-col"
    >
      <SettingsHeader />
      
      <div className="flex-1 overflow-auto">
        {/* Settings content with tab context */}
        <div className="p-4">
          {/* Current tab indicator for child components */}
          <div className="hidden" data-current-tab={currentTab}></div>
          {children}
        </div>
      </div>
      
      <SettingsFooter />
    </WindowLayout>
  );
}