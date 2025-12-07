import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Theme, ThemeColors, ThemePreference, BuiltInThemeId } from '../../../shared/types/theme';
import { BUILT_IN_THEMES } from '../../../shared/types/theme';

interface ThemeContextValue {
  // Current active theme
  currentTheme: Theme;
  
  // Theme preference (what the user selected)
  themePreference: ThemePreference;
  
  // Available themes (built-in + custom)
  availableThemes: Theme[];
  
  // Actions
  setThemePreference: (preference: ThemePreference) => void;
  addCustomTheme: (theme: Theme) => void;
  removeCustomTheme: (themeId: string) => void;
  
  // Utilities
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Apply theme colors to CSS variables on the document root
 */
function applyThemeColors(colors: ThemeColors): void {
  const root = document.documentElement;
  
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
}

/**
 * Set the data-theme attribute on the document root
 */
function setThemeAttribute(isDark: boolean): void {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

/**
 * Get system theme preference
 */
function getSystemTheme(): BuiltInThemeId {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Load custom themes from localStorage
 */
function loadCustomThemes(): Theme[] {
  if (typeof localStorage === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem('notnative-custom-themes');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save custom themes to localStorage
 */
function saveCustomThemes(themes: Theme[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('notnative-custom-themes', JSON.stringify(themes));
}

/**
 * Load theme preference from localStorage
 */
function loadThemePreference(): ThemePreference | null {
  if (typeof localStorage === 'undefined') return null;
  const saved = localStorage.getItem('notnative-theme-preference');
  return saved as ThemePreference | null;
}

/**
 * Save theme preference to localStorage
 */
function saveThemePreference(preference: ThemePreference): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('notnative-theme-preference', preference);
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
}

export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    () => loadThemePreference() || defaultTheme
  );
  const [customThemes, setCustomThemes] = useState<Theme[]>(loadCustomThemes);
  const [systemTheme, setSystemTheme] = useState<BuiltInThemeId>(getSystemTheme);
  
  // Resolve current theme from preference
  const resolveTheme = useCallback((preference: ThemePreference): Theme => {
    // System theme
    if (preference === 'system') {
      return BUILT_IN_THEMES[systemTheme];
    }
    
    // Built-in theme
    if (preference in BUILT_IN_THEMES) {
      return BUILT_IN_THEMES[preference as BuiltInThemeId];
    }
    
    // Custom theme
    const customTheme = customThemes.find(t => t.id === preference);
    if (customTheme) {
      return customTheme;
    }
    
    // Fallback to dark theme
    return BUILT_IN_THEMES.dark;
  }, [customThemes, systemTheme]);
  
  const currentTheme = resolveTheme(themePreference);
  
  // Combined available themes
  const availableThemes: Theme[] = [
    BUILT_IN_THEMES.dark,
    BUILT_IN_THEMES.light,
    ...customThemes,
  ];
  
  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  // Apply theme when it changes
  useEffect(() => {
    applyThemeColors(currentTheme.colors);
    setThemeAttribute(currentTheme.isDark);
  }, [currentTheme]);
  
  // Actions
  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(preference);
    saveThemePreference(preference);
  }, []);
  
  const addCustomTheme = useCallback((theme: Theme) => {
    setCustomThemes(prev => {
      // Replace if exists, otherwise add
      const filtered = prev.filter(t => t.id !== theme.id);
      const updated = [...filtered, theme];
      saveCustomThemes(updated);
      return updated;
    });
  }, []);
  
  const removeCustomTheme = useCallback((themeId: string) => {
    setCustomThemes(prev => {
      const updated = prev.filter(t => t.id !== themeId);
      saveCustomThemes(updated);
      
      // If current theme was removed, switch to dark
      if (themePreference === themeId) {
        setThemePreference('dark');
      }
      
      return updated;
    });
  }, [themePreference, setThemePreference]);
  
  const value: ThemeContextValue = {
    currentTheme,
    themePreference,
    availableThemes,
    setThemePreference,
    addCustomTheme,
    removeCustomTheme,
    isDark: currentTheme.isDark,
  };
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Hook to get just the current theme colors
 */
export function useThemeColors(): ThemeColors {
  const { currentTheme } = useTheme();
  return currentTheme.colors;
}

/**
 * Hook to check if current theme is dark
 */
export function useIsDarkTheme(): boolean {
  const { isDark } = useTheme();
  return isDark;
}
