import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface WindowInfo {
  windowId: string;
  type: string;
  isVisible: boolean;
  config: any;
}

interface PortalManagerContextType {
  currentWindow: WindowInfo | null;
  allWindows: WindowInfo[];
  createWindow: (type: string, config?: any) => Promise<string>;
  showWindow: (windowId: string) => void;
  hideWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  sendToWindow: (targetWindowId: string, channel: string, ...args: any[]) => void;
  broadcast: (channel: string, ...args: any[]) => void;
  onInterWindowMessage: (callback: (channel: string, ...args: any[]) => void) => () => void;
}

const PortalManagerContext = createContext<PortalManagerContextType | null>(null);

export const usePortalManager = () => {
  const context = useContext(PortalManagerContext);
  if (!context) {
    throw new Error('usePortalManager must be used within a PortalManagerProvider');
  }
  return context;
};

interface PortalManagerProviderProps {
  children: ReactNode;
}

export const PortalManagerProvider: React.FC<PortalManagerProviderProps> = ({ children }) => {
  const [currentWindow, setCurrentWindow] = useState<WindowInfo | null>(null);
  const [allWindows, setAllWindows] = useState<WindowInfo[]>([]);

  useEffect(() => {
    const initializeWindowInfo = async () => {
      try {
        // Get current window info
        const windowInfo = await window.electronWindow?.getWindowInfo();
        if (windowInfo) {
          setCurrentWindow(windowInfo);
        }

        // Get all windows
        const windows = await window.electronWindow?.getAllWindows();
        if (windows) {
          setAllWindows(windows);
        }
      } catch (error) {
        console.error('Failed to initialize window info:', error);
      }
    };

    // Set up window info listener
    const removeWindowInfoListener = window.electronWindow?.onWindowInfo?.((windowInfo: WindowInfo) => {
      setCurrentWindow(windowInfo);
    });

    // Set up window state change listener
    const removeStateChangeListener = window.electronWindow?.onWindowStateChanged?.((windowInfo: WindowInfo) => {
      setAllWindows(prev => {
        const index = prev.findIndex(w => w.windowId === windowInfo.windowId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = windowInfo;
          return updated;
        } else {
          return [...prev, windowInfo];
        }
      });
    });

    initializeWindowInfo();

    return () => {
      removeWindowInfoListener?.();
      removeStateChangeListener?.();
    };
  }, []);

  const createWindow = async (type: string, config?: any): Promise<string> => {
    try {
      const windowId = await window.electronWindow?.createWindow(type, config);
      if (windowId) {
        // Refresh all windows list
        const windows = await window.electronWindow?.getAllWindows();
        if (windows) {
          setAllWindows(windows);
        }
        return windowId;
      }
      throw new Error('Failed to create window');
    } catch (error) {
      console.error('Failed to create window:', error);
      throw error;
    }
  };

  const showWindow = (windowId: string) => {
    window.electronWindow?.showWindow(windowId);
  };

  const hideWindow = (windowId: string) => {
    window.electronWindow?.hideWindow(windowId);
  };

  const focusWindow = (windowId: string) => {
    window.electronWindow?.focusWindow(windowId);
  };

  const sendToWindow = (targetWindowId: string, channel: string, ...args: any[]) => {
    window.electronWindow?.sendToWindow(targetWindowId, channel, ...args);
  };

  const broadcast = (channel: string, ...args: any[]) => {
    window.electronWindow?.broadcast(channel, ...args);
  };

  const onInterWindowMessage = (callback: (channel: string, ...args: any[]) => void) => {
    return window.electronWindow?.onInterWindowMessage?.(callback) || (() => {});
  };

  const value: PortalManagerContextType = {
    currentWindow,
    allWindows,
    createWindow,
    showWindow,
    hideWindow,
    focusWindow,
    sendToWindow,
    broadcast,
    onInterWindowMessage,
  };

  return (
    <PortalManagerContext.Provider value={value}>
      {children}
    </PortalManagerContext.Provider>
  );
};
