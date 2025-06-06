import { useEffect, useState, useCallback } from 'react';
import { usePortalManager } from '../components/portals/PortalManager';

export interface UseWindowPortalOptions {
  type: string;
  config?: any;
  autoShow?: boolean;
  persistent?: boolean;
}

export interface UseWindowPortalReturn {
  windowId: string | null;
  isWindowOpen: boolean;
  isWindowVisible: boolean;
  openWindow: () => Promise<void>;
  closeWindow: () => void;
  showWindow: () => void;
  hideWindow: () => void;
  focusWindow: () => void;
  sendMessage: (channel: string, ...args: any[]) => void;
}

export const useWindowPortal = (options: UseWindowPortalOptions): UseWindowPortalReturn => {
  const { type, config, autoShow = false, persistent = false } = options;
  const portalManager = usePortalManager();
  
  const [windowId, setWindowId] = useState<string | null>(null);
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [isWindowVisible, setIsWindowVisible] = useState(false);

  // Check if window already exists
  useEffect(() => {
    const existingWindow = portalManager.allWindows.find(w => w.type === type);
    if (existingWindow) {
      setWindowId(existingWindow.windowId);
      setIsWindowOpen(true);
      setIsWindowVisible(existingWindow.isVisible);
    }
  }, [portalManager.allWindows, type]);

  // Listen for window state changes
  useEffect(() => {
    if (!windowId) return;

    const removeListener = portalManager.onInterWindowMessage((channel: string, ...args: any[]) => {
      if (channel === 'window-state-changed' && args[0] === windowId) {
        const windowInfo = args[1];
        setIsWindowVisible(windowInfo.isVisible);
        setIsWindowOpen(!windowInfo.isDestroyed);
      } else if (channel === 'window-closed' && args[0] === windowId) {
        setIsWindowOpen(false);
        setIsWindowVisible(false);
        if (!persistent) {
          setWindowId(null);
        }
      }
    });

    return removeListener;
  }, [windowId, persistent, portalManager]);

  const openWindow = useCallback(async () => {
    try {
      if (windowId && isWindowOpen) {
        // Window already exists, just show it
        portalManager.showWindow(windowId);
        return;
      }

      // Create new window
      const newWindowId = await portalManager.createWindow(type, {
        ...config,
        show: autoShow,
      });
      
      setWindowId(newWindowId);
      setIsWindowOpen(true);
      
      if (autoShow) {
        setIsWindowVisible(true);
      }
    } catch (error) {
      console.error(`Failed to open ${type} window:`, error);
      throw error;
    }
  }, [windowId, isWindowOpen, portalManager, type, config, autoShow]);

  const closeWindow = useCallback(() => {
    if (windowId && isWindowOpen) {
      portalManager.hideWindow(windowId);
      
      if (!persistent) {
        // For non-persistent windows, we might want to actually close them
        // This would require additional IPC methods
        setIsWindowOpen(false);
        setWindowId(null);
      }
      setIsWindowVisible(false);
    }
  }, [windowId, isWindowOpen, persistent, portalManager]);

  const showWindow = useCallback(() => {
    if (windowId && isWindowOpen) {
      portalManager.showWindow(windowId);
      setIsWindowVisible(true);
    }
  }, [windowId, isWindowOpen, portalManager]);

  const hideWindow = useCallback(() => {
    if (windowId && isWindowOpen) {
      portalManager.hideWindow(windowId);
      setIsWindowVisible(false);
    }
  }, [windowId, isWindowOpen, portalManager]);

  const focusWindow = useCallback(() => {
    if (windowId && isWindowOpen) {
      portalManager.focusWindow(windowId);
    }
  }, [windowId, isWindowOpen, portalManager]);

  const sendMessage = useCallback((channel: string, ...args: any[]) => {
    if (windowId && isWindowOpen) {
      portalManager.sendToWindow(windowId, channel, ...args);
    }
  }, [windowId, isWindowOpen, portalManager]);

  // Auto-open window if configured
  useEffect(() => {
    if (autoShow && !isWindowOpen) {
      openWindow().catch(console.error);
    }
  }, [autoShow, isWindowOpen, openWindow]);

  return {
    windowId,
    isWindowOpen,
    isWindowVisible,
    openWindow,
    closeWindow,
    showWindow,
    hideWindow,
    focusWindow,
    sendMessage,
  };
};