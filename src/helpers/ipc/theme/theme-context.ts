import {contextBridge, ipcRenderer} from 'electron';
import {
  THEME_MODE_CURRENT_CHANNEL,
  THEME_MODE_DARK_CHANNEL,
  THEME_MODE_LIGHT_CHANNEL,
  THEME_MODE_SYSTEM_CHANNEL,
  THEME_MODE_TOGGLE_CHANNEL,
} from './theme-channels';

export function exposeThemeContext() {
  try {
    const globalWindow = window as unknown as Record<string, unknown>;
    if (!globalWindow.themeMode) {
      contextBridge.exposeInMainWorld('themeMode', {
        current: () => ipcRenderer.invoke(THEME_MODE_CURRENT_CHANNEL),
        toggle: () => ipcRenderer.invoke(THEME_MODE_TOGGLE_CHANNEL),
        dark: () => ipcRenderer.invoke(THEME_MODE_DARK_CHANNEL),
        light: () => ipcRenderer.invoke(THEME_MODE_LIGHT_CHANNEL),
        system: () => ipcRenderer.invoke(THEME_MODE_SYSTEM_CHANNEL),
      });
    }
  } catch (error) {
    console.error('Error exposing theme context:', error);
  }
}
