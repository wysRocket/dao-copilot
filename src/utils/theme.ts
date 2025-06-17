// Theme configuration inspired by Fumadocs dark theme
// Colors designed to work seamlessly with glassmorphism effects

export interface ThemeColors {
  // Background colors
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    card: string;
    elevated: string;
    glass: string;
  };
  
  // Text colors
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    accent: string;
    muted: string;
    inverted: string;
  };
  
  // Border colors
  border: {
    primary: string;
    secondary: string;
    focus: string;
    glass: string;
  };
  
  // Interactive colors
  interactive: {
    primary: string;
    primaryHover: string;
    secondary: string;
    secondaryHover: string;
    danger: string;
    dangerHover: string;
    success: string;
    warning: string;
  };
  
  // Glass-specific colors
  glass: {
    light: string;
    medium: string;
    heavy: string;
    border: string;
    shadow: string;
  };
}

// Fumadocs-inspired dark theme
export const darkTheme: ThemeColors = {
  background: {
    primary: '#0a0a0a',      // Deep black
    secondary: '#111111',     // Near black
    tertiary: '#1a1a1a',     // Dark gray
    card: '#1f1f1f',         // Card background
    elevated: '#262626',     // Elevated surfaces
    glass: 'rgba(255, 255, 255, 0.02)', // Glass background
  },
  
  text: {
    primary: '#ffffff',       // Pure white
    secondary: '#e5e5e5',     // Light gray
    tertiary: '#a3a3a3',     // Medium gray
    accent: '#60a5fa',        // Blue accent
    muted: '#737373',         // Muted gray
    inverted: '#0a0a0a',     // Black (for light backgrounds)
  },
  
  border: {
    primary: '#262626',       // Primary borders
    secondary: '#404040',     // Secondary borders
    focus: '#60a5fa',         // Focus states
    glass: 'rgba(255, 255, 255, 0.1)', // Glass borders
  },
  
  interactive: {
    primary: '#60a5fa',       // Primary buttons
    primaryHover: '#3b82f6',  // Primary hover
    secondary: '#374151',     // Secondary buttons
    secondaryHover: '#4b5563', // Secondary hover
    danger: '#ef4444',        // Danger/error states
    dangerHover: '#dc2626',   // Danger hover
    success: '#10b981',       // Success states
    warning: '#f59e0b',       // Warning states
  },
  
  glass: {
    light: 'rgba(255, 255, 255, 0.05)',   // Light glass overlay
    medium: 'rgba(255, 255, 255, 0.08)',  // Medium glass overlay
    heavy: 'rgba(255, 255, 255, 0.12)',   // Heavy glass overlay
    border: 'rgba(255, 255, 255, 0.1)',   // Glass borders
    shadow: 'rgba(0, 0, 0, 0.25)',        // Glass shadows
  },
};

// Light theme (for future use)
export const lightTheme: ThemeColors = {
  background: {
    primary: '#ffffff',
    secondary: '#f8fafc',
    tertiary: '#f1f5f9',
    card: '#ffffff',
    elevated: '#ffffff',
    glass: 'rgba(0, 0, 0, 0.02)',
  },
  
  text: {
    primary: '#0f172a',
    secondary: '#334155',
    tertiary: '#64748b',
    accent: '#3b82f6',
    muted: '#94a3b8',
    inverted: '#ffffff',
  },
  
  border: {
    primary: '#e2e8f0',
    secondary: '#cbd5e1',
    focus: '#3b82f6',
    glass: 'rgba(0, 0, 0, 0.1)',
  },
  
  interactive: {
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    secondary: '#e2e8f0',
    secondaryHover: '#cbd5e1',
    danger: '#ef4444',
    dangerHover: '#dc2626',
    success: '#10b981',
    warning: '#f59e0b',
  },
  
  glass: {
    light: 'rgba(0, 0, 0, 0.05)',
    medium: 'rgba(0, 0, 0, 0.08)',
    heavy: 'rgba(0, 0, 0, 0.12)',
    border: 'rgba(0, 0, 0, 0.1)',
    shadow: 'rgba(0, 0, 0, 0.15)',
  },
};

// CSS Custom Properties generator
export const generateCSSVariables = (theme: ThemeColors): Record<string, string> => {
  return {
    // Background variables
    '--bg-primary': theme.background.primary,
    '--bg-secondary': theme.background.secondary,
    '--bg-tertiary': theme.background.tertiary,
    '--bg-card': theme.background.card,
    '--bg-elevated': theme.background.elevated,
    '--bg-glass': theme.background.glass,
    
    // Text variables
    '--text-primary': theme.text.primary,
    '--text-secondary': theme.text.secondary,
    '--text-tertiary': theme.text.tertiary,
    '--text-accent': theme.text.accent,
    '--text-muted': theme.text.muted,
    '--text-inverted': theme.text.inverted,
    
    // Border variables
    '--border-primary': theme.border.primary,
    '--border-secondary': theme.border.secondary,
    '--border-focus': theme.border.focus,
    '--border-glass': theme.border.glass,
    
    // Interactive variables
    '--interactive-primary': theme.interactive.primary,
    '--interactive-primary-hover': theme.interactive.primaryHover,
    '--interactive-secondary': theme.interactive.secondary,
    '--interactive-secondary-hover': theme.interactive.secondaryHover,
    '--interactive-danger': theme.interactive.danger,
    '--interactive-danger-hover': theme.interactive.dangerHover,
    '--interactive-success': theme.interactive.success,
    '--interactive-warning': theme.interactive.warning,
    
    // Glass variables
    '--glass-light': theme.glass.light,
    '--glass-medium': theme.glass.medium,
    '--glass-heavy': theme.glass.heavy,
    '--glass-border': theme.glass.border,
    '--glass-shadow': theme.glass.shadow,
  };
};

// Theme modes
export type ThemeMode = 'light' | 'dark' | 'system';

// Get system theme preference
export const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark'; // Default to dark
};

// Apply theme to document
export const applyTheme = (theme: ThemeColors) => {
  if (typeof document !== 'undefined') {
    const variables = generateCSSVariables(theme);
    const root = document.documentElement;
    
    Object.entries(variables).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
  }
};

// Default export for the current theme
export default darkTheme;
