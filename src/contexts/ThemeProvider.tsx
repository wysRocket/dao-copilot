import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  ThemeColors, 
  ThemeMode, 
  darkTheme, 
  lightTheme, 
  getSystemTheme, 
  applyTheme 
} from '../utils/theme';

// Theme context interface
interface ThemeContextType {
  theme: ThemeColors;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  isDark: boolean;
  isLight: boolean;
  colors: ThemeColors;
}

// Create the theme context
const ThemeContext = createContext<ThemeContextType | null>(null);

// Theme provider props
interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
  storageKey?: string;
}

// Local storage key for theme persistence
const DEFAULT_STORAGE_KEY = 'dao-copilot-theme';

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultMode = 'dark',
  storageKey = DEFAULT_STORAGE_KEY,
}) => {
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [theme, setTheme] = useState<ThemeColors>(darkTheme);

  // Load theme from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsedMode = stored as ThemeMode;
        if (['light', 'dark', 'system'].includes(parsedMode)) {
          setModeState(parsedMode);
        }
      }
    } catch (error) {
      console.warn('Failed to load theme from localStorage:', error);
    }
  }, [storageKey]);

  // Update theme when mode changes
  useEffect(() => {
    const updateTheme = () => {
      let selectedTheme: ThemeColors;
      
      if (mode === 'system') {
        selectedTheme = getSystemTheme() === 'dark' ? darkTheme : lightTheme;
      } else {
        selectedTheme = mode === 'dark' ? darkTheme : lightTheme;
      }
      
      setTheme(selectedTheme);
      applyTheme(selectedTheme);
    };

    updateTheme();

    // Listen for system theme changes when in system mode
    if (mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => updateTheme();
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [mode]);

  // Set mode and persist to localStorage
  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(storageKey, newMode);
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error);
    }
  };

  // Toggle between light and dark (skips system)
  const toggleTheme = () => {
    const currentEffectiveTheme = mode === 'system' 
      ? getSystemTheme() 
      : mode;
    
    setMode(currentEffectiveTheme === 'dark' ? 'light' : 'dark');
  };

  // Computed values
  const isDark = mode === 'dark' || (mode === 'system' && getSystemTheme() === 'dark');
  const isLight = !isDark;

  // Context value
  const contextValue: ThemeContextType = {
    theme,
    mode,
    setMode,
    toggleTheme,
    isDark,
    isLight,
    colors: theme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook to use theme context
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
};

// Higher-order component for theme-aware components
export const withTheme = <P extends object>(
  Component: React.ComponentType<P & { theme: ThemeColors }>
) => {
  const WrappedComponent = React.forwardRef<unknown, P>((props, ref) => {
    const { theme } = useTheme();
    return <Component {...(props as P & { theme: ThemeColors })} theme={theme} ref={ref} />;
  });
  
  WrappedComponent.displayName = `withTheme(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

// Theme-aware className utility
export const useThemeClasses = () => {
  const { isDark, isLight } = useTheme();
  
  return {
    isDark,
    isLight,
    themeClass: isDark ? 'dark' : 'light',
    backgroundClass: isDark 
      ? 'bg-[var(--bg-primary)] text-[var(--text-primary)]' 
      : 'bg-[var(--bg-primary)] text-[var(--text-primary)]',
    cardClass: isDark
      ? 'bg-[var(--bg-card)] border-[var(--border-primary)]'
      : 'bg-[var(--bg-card)] border-[var(--border-primary)]',
    glassClass: isDark
      ? 'bg-[var(--glass-medium)] border-[var(--glass-border)] backdrop-blur-sm'
      : 'bg-[var(--glass-medium)] border-[var(--glass-border)] backdrop-blur-sm',
  };
};

// Theme constants for easy access
export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];

export default ThemeProvider;
