import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface WindowState {
  windowId: string;
  windowType: string;
  isVisible: boolean;
  isFocused: boolean;
  config: any;
  
  // Window-specific UI state
  localState: {
    sidebarOpen?: boolean;
    currentView?: string;
    scrollPosition?: number;
    formData?: Record<string, any>;
    selectedItems?: string[];
    searchQuery?: string;
  };
}

interface WindowStateContextType {
  windowState: WindowState;
  updateLocalState: <K extends keyof WindowState['localState']>(
    key: K, 
    value: WindowState['localState'][K]
  ) => void;
  resetLocalState: () => void;
  focusWindow: () => void;
  hideWindow: () => void;
  showWindow: () => void;
}

const WindowStateContext = createContext<WindowStateContextType | null>(null);

export const useWindowState = () => {
  const context = useContext(WindowStateContext);
  if (!context) {
    throw new Error('useWindowState must be used within a WindowStateProvider');
  }
  return context;
};

interface WindowStateProviderProps {
  children: ReactNode;
}

export const WindowStateProvider: React.FC<WindowStateProviderProps> = ({ children }) => {
  const [windowState, setWindowState] = useState<WindowState>({
    windowId: '',
    windowType: 'main',
    isVisible: true,
    isFocused: true,
    config: {},
    localState: {},
  });

  // Initialize window state
  useEffect(() => {
    const initializeWindowState = async () => {
      try {
        // Get window info from URL params first
        const urlParams = new URLSearchParams(window.location.search);
        const windowType = urlParams.get('windowType') || 'main';
        
        // Get current window info from IPC
        const windowInfo = await window.electronWindow?.getWindowInfo();
        
        if (windowInfo) {
          setWindowState(prev => ({
            ...prev,
            windowId: windowInfo.windowId,
            windowType: windowInfo.type || windowType,
            isVisible: windowInfo.isVisible,
            config: windowInfo.config,
          }));
        } else {
          // Fallback for URL-based window type
          setWindowState(prev => ({
            ...prev,
            windowType,
          }));
        }

        // Load persisted local state
        const persistedLocalState = localStorage.getItem(`windowLocalState-${windowInfo?.windowId || windowType}`);
        if (persistedLocalState) {
          const parsedLocalState = JSON.parse(persistedLocalState);
          setWindowState(prev => ({
            ...prev,
            localState: parsedLocalState,
          }));
        }
      } catch (error) {
        console.error('Failed to initialize window state:', error);
      }
    };

    initializeWindowState();
  }, []);

  // Listen for window events
  useEffect(() => {
    const handleWindowFocus = () => {
      setWindowState(prev => ({ ...prev, isFocused: true }));
    };

    const handleWindowBlur = () => {
      setWindowState(prev => ({ ...prev, isFocused: false }));
    };

    const handleWindowVisibilityChange = () => {
      setWindowState(prev => ({
        ...prev,
        isVisible: !document.hidden,
      }));
    };

    // Listen for window info updates
    const removeWindowInfoListener = window.electronWindow?.onWindowInfo?.((windowInfo) => {
      setWindowState(prev => ({
        ...prev,
        windowId: windowInfo.windowId,
        windowType: windowInfo.type,
        isVisible: windowInfo.isVisible,
        config: windowInfo.config,
      }));
    });

    // Listen for inter-window messages about window state
    const removeInterWindowListener = window.electronWindow?.onInterWindowMessage?.(
      (channel: string, ...args: any[]) => {
        if (channel === 'window-focus-changed' && args[0] === windowState.windowId) {
          setWindowState(prev => ({ ...prev, isFocused: args[1] }));
        } else if (channel === 'window-visibility-changed' && args[0] === windowState.windowId) {
          setWindowState(prev => ({ ...prev, isVisible: args[1] }));
        }
      }
    );

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleWindowVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleWindowVisibilityChange);
      removeWindowInfoListener?.();
      removeInterWindowListener?.();
    };
  }, [windowState.windowId]);

  // Persist local state changes
  useEffect(() => {
    if (windowState.windowId || windowState.windowType) {
      const key = `windowLocalState-${windowState.windowId || windowState.windowType}`;
      localStorage.setItem(key, JSON.stringify(windowState.localState));
    }
  }, [windowState.localState, windowState.windowId, windowState.windowType]);

  const updateLocalState = <K extends keyof WindowState['localState']>(
    key: K,
    value: WindowState['localState'][K]
  ) => {
    setWindowState(prev => ({
      ...prev,
      localState: {
        ...prev.localState,
        [key]: value,
      },
    }));
  };

  const resetLocalState = () => {
    setWindowState(prev => ({
      ...prev,
      localState: {},
    }));
    
    // Clear persisted state
    if (windowState.windowId || windowState.windowType) {
      const key = `windowLocalState-${windowState.windowId || windowState.windowType}`;
      localStorage.removeItem(key);
    }
  };

  const focusWindow = () => {
    if (windowState.windowId) {
      window.electronWindow?.focusWindow(windowState.windowId);
    }
  };

  const hideWindow = () => {
    if (windowState.windowId) {
      window.electronWindow?.hideWindow(windowState.windowId);
    }
  };

  const showWindow = () => {
    if (windowState.windowId) {
      window.electronWindow?.showWindow(windowState.windowId);
    }
  };

  const contextValue: WindowStateContextType = {
    windowState,
    updateLocalState,
    resetLocalState,
    focusWindow,
    hideWindow,
    showWindow,
  };

  return (
    <WindowStateContext.Provider value={contextValue}>
      {children}
    </WindowStateContext.Provider>
  );
};
