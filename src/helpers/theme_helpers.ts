// Theme mode type definition
export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'theme';

export interface ThemePreferences {
  system: ThemeMode;
  local: ThemeMode | null;
}

// Extend Window interface for themeMode (Electron IPC)
declare global {
  interface Window {
    themeMode?: {
      current: () => Promise<ThemeMode>;
      toggle: () => Promise<boolean>;
      dark: () => Promise<void>;
      light: () => Promise<void>;
      system: () => Promise<boolean>;
    };
  }
}

export async function getCurrentTheme(): Promise<ThemePreferences> {
  try {
    const currentTheme = await window.themeMode?.current();
    const localTheme = localStorage.getItem(THEME_KEY) as ThemeMode | null;

    return {
      system: currentTheme || 'system',
      local: localTheme,
    };
  } catch (error) {
    console.error('Error getting current theme:', error);
    return {
      system: 'system',
      local: localStorage.getItem(THEME_KEY) as ThemeMode | null,
    };
  }
}

export async function setTheme(newTheme: ThemeMode): Promise<void> {
  try {
    if (!window.themeMode) {
      console.warn(
        'Theme mode API not available, falling back to document theme update',
      );
      updateDocumentTheme(newTheme === 'dark');
      localStorage.setItem(THEME_KEY, newTheme);
      return;
    }

    switch (newTheme) {
      case 'dark':
        await window.themeMode.dark();
        updateDocumentTheme(true);
        break;
      case 'light':
        await window.themeMode.light();
        updateDocumentTheme(false);
        break;
      case 'system': {
        const isDarkMode = await window.themeMode.system();
        updateDocumentTheme(isDarkMode ?? false);
        break;
      }
      default:
        console.warn(`Unknown theme mode: ${newTheme}`);
        break;
    }

    localStorage.setItem(THEME_KEY, newTheme);
  } catch (error) {
    console.error('Error setting theme:', error);
    // Fallback to document update only
    updateDocumentTheme(newTheme === 'dark');
    localStorage.setItem(THEME_KEY, newTheme);
  }
}

export async function toggleTheme(): Promise<void> {
  try {
    if (!window.themeMode) {
      console.warn(
        'Theme mode API not available, falling back to manual toggle',
      );
      // Fallback: get current theme from document and toggle
      const isDarkMode = document.documentElement.classList.contains('dark');
      const newTheme = isDarkMode ? 'light' : 'dark';
      updateDocumentTheme(!isDarkMode);
      localStorage.setItem(THEME_KEY, newTheme);
      return;
    }

    const isDarkMode = await window.themeMode.toggle();
    const newTheme = isDarkMode ? 'dark' : 'light';

    updateDocumentTheme(isDarkMode);
    localStorage.setItem(THEME_KEY, newTheme);
  } catch (error) {
    console.error('Error toggling theme:', error);
    // Fallback to manual toggle
    const isDarkMode = document.documentElement.classList.contains('dark');
    const newTheme = isDarkMode ? 'light' : 'dark';
    updateDocumentTheme(!isDarkMode);
    localStorage.setItem(THEME_KEY, newTheme);
  }
}

export async function syncThemeWithLocal(): Promise<void> {
  try {
    const {local} = await getCurrentTheme();
    await setTheme(local || 'system');
  } catch (error) {
    console.error('Error syncing theme with local storage:', error);
    // Fallback to system theme
    await setTheme('system');
  }
}

/**
 * Updates the document's theme class based on the dark mode state
 */
function updateDocumentTheme(isDarkMode: boolean): void {
  try {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (error) {
    console.error('Error updating document theme:', error);
  }
}

/**
 * Gets the current theme from local storage
 */
export function getLocalTheme(): ThemeMode | null {
  try {
    return localStorage.getItem(THEME_KEY) as ThemeMode | null;
  } catch (error) {
    console.error('Error reading theme from local storage:', error);
    return null;
  }
}

/**
 * Checks if the current system theme is dark
 */
export function isSystemDark(): boolean {
  try {
    return (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch (error) {
    console.error('Error detecting system theme:', error);
    return false;
  }
}

/**
 * Listens for system theme changes
 */
export function onSystemThemeChange(
  callback: (isDark: boolean) => void,
): () => void {
  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => callback(e.matches);

    mediaQuery.addEventListener('change', handler);

    // Return cleanup function
    return () => mediaQuery.removeEventListener('change', handler);
  } catch (error) {
    console.error('Error setting up system theme listener:', error);
    return () => {}; // Return empty cleanup function
  }
}
