import React, {useEffect, useState} from 'react';
import {usePortalManager} from './PortalManager';

// Import window-specific components and layouts
import HomePage from '../../pages/HomePage';
import AssistantWindowLayout from '../../layouts/AssistantWindowLayout';
import SettingsWindowLayout from '../../layouts/SettingsWindowLayout';
import OverlayWindowLayout from '../../layouts/OverlayWindowLayout';
import WindowLayout from '../../layouts/WindowLayout';
import {WindowInput} from '../ui/window-input';
import {WindowButton} from '../ui/window-button';

interface WindowRendererProps {
  // Optional override for window type
  windowType?: string;
}

export const WindowRenderer: React.FC<WindowRendererProps> = ({windowType}) => {
  const portalManager = usePortalManager();
  const [currentWindowType, setCurrentWindowType] = useState<string>('main');
  const [windowId, setWindowId] = useState<string>('');

  useEffect(() => {
    // Get window type from URL parameters or current window info
    const urlParams = new URLSearchParams(window.location.search);
    const urlWindowType = urlParams.get('windowType');

    if (windowType) {
      setCurrentWindowType(windowType);
    } else if (urlWindowType) {
      setCurrentWindowType(urlWindowType);
    } else if (portalManager.currentWindow) {
      setCurrentWindowType(portalManager.currentWindow.type);
      setWindowId(portalManager.currentWindow.windowId);
    }
  }, [windowType, portalManager.currentWindow]);

  // Listen for window info updates
  useEffect(() => {
    const removeListener = portalManager.onInterWindowMessage(
      (channel: string, ...args: any[]) => {
        if (channel === 'window-info' && args[0]?.windowId) {
          const windowInfo = args[0];
          setCurrentWindowType(windowInfo.type);
          setWindowId(windowInfo.windowId);
        }
      },
    );

    return removeListener;
  }, [portalManager]);

  // Render appropriate component based on window type
  const renderWindowContent = () => {
    switch (currentWindowType) {
      case 'main':
        return <HomePage />;

      case 'assistant':
        return (
          <AssistantWindowLayout>
            <div className="flex h-full flex-col">
              <div className="bg-card m-2 flex-1 rounded-lg p-4">
                <div className="text-muted-foreground mb-4 text-sm">
                  AI Assistant window content will be implemented here.
                </div>
                <div className="space-y-2">
                  <div className="rounded-md bg-blue-50 p-3 text-sm">
                    <strong>Assistant:</strong> Hello! I'm your AI assistant.
                    How can I help you today?
                  </div>
                </div>
              </div>
              <div className="flex space-x-2 p-2">
                <WindowInput
                  type="text"
                  placeholder="Type your message..."
                  localKey="chatMessage"
                  className="flex-1"
                />
                <WindowButton variant="default">Send</WindowButton>
              </div>
            </div>
          </AssistantWindowLayout>
        );

      case 'settings':
        return (
          <SettingsWindowLayout>
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Theme</label>
                  <select className="bg-background w-full rounded-md border px-3 py-2">
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Audio Input</label>
                  <select className="bg-background w-full rounded-md border px-3 py-2">
                    <option value="default">Default Microphone</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Transcription Service
                  </label>
                  <select className="bg-background w-full rounded-md border px-3 py-2">
                    <option value="openai">OpenAI Whisper</option>
                    <option value="local">Local Processing</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <WindowInput
                    type="password"
                    placeholder="Enter your API key..."
                    localKey="apiKey"
                    persistOnBlur
                  />
                </div>
              </div>
            </div>
          </SettingsWindowLayout>
        );

      case 'overlay':
        return (
          <OverlayWindowLayout>
            <button
              className="hover:bg-accent w-full rounded px-2 py-1 text-left text-sm"
              onClick={() => portalManager.createWindow('assistant')}
            >
              🤖 Open AI Assistant
            </button>
            <button
              className="hover:bg-accent w-full rounded px-2 py-1 text-left text-sm"
              onClick={() => portalManager.createWindow('settings')}
            >
              ⚙️ Open Settings
            </button>
            <button
              className="hover:bg-accent w-full rounded px-2 py-1 text-left text-sm"
              onClick={() => portalManager.focusWindow('main')}
            >
              🏠 Focus Main Window
            </button>
          </OverlayWindowLayout>
        );

      default:
        return (
          <WindowLayout>
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="text-lg font-semibold">Unknown Window Type</div>
                <div className="text-muted-foreground text-sm">
                  Window type: {currentWindowType}
                </div>
              </div>
            </div>
          </WindowLayout>
        );
    }
  };

  return <div className="h-full w-full">{renderWindowContent()}</div>;
};
