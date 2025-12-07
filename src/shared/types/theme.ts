// ============== THEME SYSTEM ==============

/**
 * Color palette for a theme
 * Based on Catppuccin color scheme naming
 */
export interface ThemeColors {
  // Background colors
  base: string;       // Main background
  mantle: string;     // Secondary background (sidebar, panels)
  crust: string;      // Tertiary background (darker elements)
  
  // Surface colors (for elevated elements)
  surface0: string;
  surface1: string;
  surface2: string;
  
  // Overlay colors (for floating elements)
  overlay0: string;
  overlay1: string;
  overlay2: string;
  
  // Text colors
  subtext0: string;   // Dimmed text
  subtext1: string;   // Secondary text
  text: string;       // Primary text
  
  // Accent colors
  lavender: string;
  blue: string;
  sapphire: string;
  sky: string;
  teal: string;
  green: string;
  yellow: string;
  peach: string;
  maroon: string;
  red: string;
  mauve: string;
  pink: string;
  flamingo: string;
  rosewater: string;
}

/**
 * Theme metadata
 */
export interface ThemeMetadata {
  id: string;           // Unique identifier (e.g., "catppuccin-mocha")
  name: string;         // Display name (e.g., "Catppuccin Mocha")
  author?: string;      // Theme author
  version?: string;     // Theme version
  description?: string; // Short description
  isDark: boolean;      // Whether this is a dark theme
}

/**
 * Complete theme definition
 */
export interface Theme extends ThemeMetadata {
  colors: ThemeColors;
}

/**
 * Theme file format (JSON)
 */
export interface ThemeFile {
  $schema?: string;     // JSON schema URL for validation
  meta: ThemeMetadata;
  colors: ThemeColors;
}

/**
 * Built-in theme identifiers
 */
export type BuiltInThemeId = 'dark' | 'light';

/**
 * Theme preference (can be built-in ID or custom theme ID)
 */
export type ThemePreference = BuiltInThemeId | 'system' | string;

/**
 * Settings related to appearance
 */
export interface AppearanceSettings {
  theme: ThemePreference;
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: string;
  lineHeight: number;
  customThemes: Theme[];
}

/**
 * Default appearance settings
 */
export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  theme: 'dark',
  fontSize: 'medium',
  fontFamily: 'Inter',
  lineHeight: 1.6,
  customThemes: [],
};

/**
 * Catppuccin Mocha (Dark) theme colors
 */
export const CATPPUCCIN_MOCHA: ThemeColors = {
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',
  surface0: '#313244',
  surface1: '#45475a',
  surface2: '#585b70',
  overlay0: '#6c7086',
  overlay1: '#7f849c',
  overlay2: '#9399b2',
  subtext0: '#a6adc8',
  subtext1: '#bac2de',
  text: '#cdd6f4',
  lavender: '#b4befe',
  blue: '#89b4fa',
  sapphire: '#74c7ec',
  sky: '#89dceb',
  teal: '#94e2d5',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  peach: '#fab387',
  maroon: '#eba0ac',
  red: '#f38ba8',
  mauve: '#cba6f7',
  pink: '#f5c2e7',
  flamingo: '#f2cdcd',
  rosewater: '#f5e0dc',
};

/**
 * Catppuccin Latte (Light) theme colors
 */
export const CATPPUCCIN_LATTE: ThemeColors = {
  base: '#eff1f5',
  mantle: '#e6e9ef',
  crust: '#dce0e8',
  surface0: '#ccd0da',
  surface1: '#bcc0cc',
  surface2: '#acb0be',
  overlay0: '#9ca0b0',
  overlay1: '#8c8fa1',
  overlay2: '#7c7f93',
  subtext0: '#6c6f85',
  subtext1: '#5c5f77',
  text: '#4c4f69',
  lavender: '#7287fd',
  blue: '#1e66f5',
  sapphire: '#209fb5',
  sky: '#04a5e5',
  teal: '#179299',
  green: '#40a02b',
  yellow: '#df8e1d',
  peach: '#fe640b',
  maroon: '#e64553',
  red: '#d20f39',
  mauve: '#8839ef',
  pink: '#ea76cb',
  flamingo: '#dd7878',
  rosewater: '#dc8a78',
};

/**
 * Built-in themes
 */
export const BUILT_IN_THEMES: Record<BuiltInThemeId, Theme> = {
  dark: {
    id: 'dark',
    name: 'Catppuccin Mocha',
    author: 'Catppuccin',
    description: 'Soothing pastel theme for dark mode',
    isDark: true,
    colors: CATPPUCCIN_MOCHA,
  },
  light: {
    id: 'light',
    name: 'Catppuccin Latte',
    author: 'Catppuccin',
    description: 'Soothing pastel theme for light mode',
    isDark: false,
    colors: CATPPUCCIN_LATTE,
  },
};

/**
 * JSON Schema for theme files
 */
export const THEME_JSON_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NotNative Theme",
  "description": "Color theme for NotNative application",
  "type": "object",
  "required": ["meta", "colors"],
  "properties": {
    "$schema": { "type": "string" },
    "meta": {
      "type": "object",
      "required": ["id", "name", "isDark"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
        "name": { "type": "string" },
        "author": { "type": "string" },
        "version": { "type": "string" },
        "description": { "type": "string" },
        "isDark": { "type": "boolean" }
      }
    },
    "colors": {
      "type": "object",
      "required": [
        "base", "mantle", "crust",
        "surface0", "surface1", "surface2",
        "overlay0", "overlay1", "overlay2",
        "subtext0", "subtext1", "text",
        "lavender", "blue", "sapphire", "sky", "teal",
        "green", "yellow", "peach", "maroon", "red",
        "mauve", "pink", "flamingo", "rosewater"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^.*$": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}$"
        }
      }
    }
  }
};
