import { useState, useEffect } from 'react';

// Platform detection types
export type Platform = 'tauri' | 'electron' | 'web';

export interface PlatformInfo {
  platform: Platform;
  isDesktop: boolean;
  isTauri: boolean;
  isElectron: boolean;
  isWeb: boolean;
  osInfo?: {
    platform: string;
    arch: string;
    version: string;
  };
}

// Tauri API detection and wrapper
declare global {
  interface Window {
    __TAURI__?: {
      invoke: (command: string, args?: any) => Promise<any>;
      tauri: any;
    };
    electronAPI?: any;
  }
}

export const useTauri = () => {
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    platform: 'web',
    isDesktop: false,
    isTauri: false,
    isElectron: false,
    isWeb: true,
  });

  useEffect(() => {
    const detectPlatform = async () => {
      // Check for Tauri
      if (window.__TAURI__) {
        try {
          const osInfo = await window.__TAURI__.invoke('get_platform_info');
          setPlatformInfo({
            platform: 'tauri',
            isDesktop: true,
            isTauri: true,
            isElectron: false,
            isWeb: false,
            osInfo,
          });
          return;
        } catch (error) {
          console.warn('Tauri detection failed:', error);
        }
      }

      // Check for Electron
      if (window.electronAPI || (window as any).require) {
        setPlatformInfo({
          platform: 'electron',
          isDesktop: true,
          isTauri: false,
          isElectron: true,
          isWeb: false,
        });
        return;
      }

      // Default to web
      setPlatformInfo({
        platform: 'web',
        isDesktop: false,
        isTauri: false,
        isElectron: false,
        isWeb: true,
      });
    };

    detectPlatform();
  }, []);

  // Tauri-specific API functions
  const invoke = async (command: string, args?: any) => {
    if (!window.__TAURI__) {
      throw new Error('Tauri not available');
    }
    return window.__TAURI__.invoke(command, args);
  };

  const greet = async (name: string): Promise<string> => {
    if (platformInfo.isTauri) {
      return invoke('greet', { name });
    }
    return Promise.resolve(`Hello, ${name}! (Web fallback)`);
  };

  const saveConversation = async (conversationId: string, content: string): Promise<void> => {
    if (platformInfo.isTauri) {
      return invoke('save_conversation', { conversation_id: conversationId, content });
    }
    // Fallback for non-Tauri environments
    console.log('Saving conversation (fallback):', conversationId, content);
    return Promise.resolve();
  };

  const loadConversations = async (): Promise<Record<string, string>> => {
    if (platformInfo.isTauri) {
      return invoke('load_conversations');
    }
    // Fallback for non-Tauri environments
    return Promise.resolve({});
  };

  const toggleWindowVisibility = async (): Promise<void> => {
    if (platformInfo.isTauri) {
      return invoke('toggle_window_visibility');
    }
    // No-op for non-desktop environments
    return Promise.resolve();
  };

  return {
    platformInfo,
    invoke,
    // Convenience methods
    greet,
    saveConversation,
    loadConversations,
    toggleWindowVisibility,
    // Utility functions
    isTauriAvailable: platformInfo.isTauri,
    isDesktopApp: platformInfo.isDesktop,
    getPlatform: () => platformInfo.platform,
  };
};

export default useTauri;