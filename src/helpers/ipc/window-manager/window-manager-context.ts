import {contextBridge, ipcRenderer} from 'electron';
import {WindowType} from '../../window-manager';

// Define the window manager API
export interface WindowManagerAPI {
  createWindow: (type: WindowType) => Promise<void>;
  closeWindow: (type: WindowType) => Promise<void>;
  showWindow: (type: WindowType) => Promise<void>;
  hideWindow: (type: WindowType) => Promise<void>;
  toggleWindow: (type: WindowType) => Promise<void>;
  isWindowVisible: (type: WindowType) => Promise<boolean>;
  getCurrentWindowType: () => string | null;
}

// Expose the window manager API to the renderer process
export function exposeWindowManagerContext(): void {
  const windowManagerAPI: WindowManagerAPI = {
    createWindow: (type) => ipcRenderer.invoke('window:create', type),
    closeWindow: (type) => ipcRenderer.invoke('window:close', type),
    showWindow: (type) => ipcRenderer.invoke('window:show', type),
    hideWindow: (type) => ipcRenderer.invoke('window:hide', type),
    toggleWindow: (type) => ipcRenderer.invoke('window:toggle', type),
    isWindowVisible: (type) => ipcRenderer.invoke('window:isVisible', type),
    getCurrentWindowType: () => {
      // Get the window type from URL parameters
      const urlParams = new URLSearchParams(
        window.location.search || window.location.hash.slice(1),
      );
      return urlParams.get('windowType');
    },
  };

  // Expose the API to the renderer process
  contextBridge.exposeInMainWorld('windowManager', windowManagerAPI);
}

// Declare the API in the global namespace
declare global {
  interface Window {
    windowManager: WindowManagerAPI;
  }
}