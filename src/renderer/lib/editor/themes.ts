import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * Get computed CSS variable value from document root
 * Falls back to provided default if variable is not defined
 */
function getCSSVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Get all theme colors from CSS variables
 * This allows the editor to dynamically update when the theme changes
 */
function getThemeColors() {
  return {
    base: getCSSVar('--base', '#1e1e2e'),
    mantle: getCSSVar('--mantle', '#181825'),
    crust: getCSSVar('--crust', '#11111b'),
    surface0: getCSSVar('--surface0', '#313244'),
    surface1: getCSSVar('--surface1', '#45475a'),
    surface2: getCSSVar('--surface2', '#585b70'),
    overlay0: getCSSVar('--overlay0', '#6c7086'),
    overlay1: getCSSVar('--overlay1', '#7f849c'),
    overlay2: getCSSVar('--overlay2', '#9399b2'),
    subtext0: getCSSVar('--subtext0', '#a6adc8'),
    subtext1: getCSSVar('--subtext1', '#bac2de'),
    text: getCSSVar('--text', '#cdd6f4'),
    lavender: getCSSVar('--lavender', '#b4befe'),
    blue: getCSSVar('--blue', '#89b4fa'),
    sapphire: getCSSVar('--sapphire', '#74c7ec'),
    sky: getCSSVar('--sky', '#89dceb'),
    teal: getCSSVar('--teal', '#94e2d5'),
    green: getCSSVar('--green', '#a6e3a1'),
    yellow: getCSSVar('--yellow', '#f9e2af'),
    peach: getCSSVar('--peach', '#fab387'),
    maroon: getCSSVar('--maroon', '#eba0ac'),
    red: getCSSVar('--red', '#f38ba8'),
    mauve: getCSSVar('--mauve', '#cba6f7'),
    pink: getCSSVar('--pink', '#f5c2e7'),
    flamingo: getCSSVar('--flamingo', '#f2cdcd'),
    rosewater: getCSSVar('--rosewater', '#f5e0dc'),
  };
}

// Export colors getter for use in other components
export { getThemeColors };

/**
 * Create editor theme extension that uses CSS variables
 * This theme will automatically update when CSS variables change
 */
export function createEditorTheme(isDark: boolean = true): Extension {
  const colors = getThemeColors();
  
  return EditorView.theme({
    '&': {
      backgroundColor: 'var(--base)',
      color: 'var(--text)',
    },
    '.cm-content': {
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
      fontSize: '0.9375rem', // 15px at 16px base, scales with root font-size
      lineHeight: '1.6',
      caretColor: 'var(--rosewater)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--mantle)',
      color: 'var(--overlay0)',
      border: 'none',
      paddingRight: '0.5rem',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--surface0)',
      color: 'var(--text)',
    },
    '.cm-activeLine': {
      backgroundColor: `${colors.surface0}80`,
    },
    '.cm-selectionBackground': {
      backgroundColor: `${colors.surface1}!important`,
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: `${colors.surface2}!important`,
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--rosewater)',
      borderLeftWidth: '2px',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--surface1)',
      outline: `1px solid var(--overlay0)`,
    },
    // Vim visual mode selection
    '.cm-fat-cursor': {
      backgroundColor: `${colors.mauve}80!important`,
      color: 'var(--base)',
    },
    '.cm-vim-panel': {
      backgroundColor: 'var(--mantle)',
      color: 'var(--text)',
      padding: '0.25rem 0.5rem',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '0.8125rem',
    },
    '.cm-vim-panel input': {
      backgroundColor: 'transparent',
      color: 'var(--text)',
      border: 'none',
      outline: 'none',
      fontFamily: 'inherit',
      fontSize: 'inherit',
    },
    // Search highlights
    '.cm-searchMatch': {
      backgroundColor: `${colors.peach}40`,
      outline: `1px solid var(--peach)`,
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: `${colors.yellow}60`,
    },
    // Line numbers
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 0.5rem 0 1rem',
      minWidth: '2.5rem',
    },
    // Scrollbar
    '&::-webkit-scrollbar': {
      width: '0.5rem',
      height: '0.5rem',
    },
    '&::-webkit-scrollbar-track': {
      backgroundColor: 'var(--mantle)',
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: 'var(--surface1)',
      borderRadius: '0.25rem',
    },
    '&::-webkit-scrollbar-thumb:hover': {
      backgroundColor: 'var(--surface2)',
    },
  }, { dark: isDark });
}

// Legacy exports for backward compatibility
export const notnativeDark = createEditorTheme(true);
export const notnativeLight = createEditorTheme(false);

/**
 * Create syntax highlighting that uses theme colors
 */
export function createSyntaxHighlighting(): Extension {
  const colors = getThemeColors();
  
  const highlightStyle = HighlightStyle.define([
    { tag: tags.heading1, color: colors.red, fontWeight: 'bold', fontSize: '1.5em' },
    { tag: tags.heading2, color: colors.peach, fontWeight: 'bold', fontSize: '1.3em' },
    { tag: tags.heading3, color: colors.yellow, fontWeight: 'bold', fontSize: '1.1em' },
    { tag: tags.heading4, color: colors.green, fontWeight: 'bold' },
    { tag: tags.heading5, color: colors.teal, fontWeight: 'bold' },
    { tag: tags.heading6, color: colors.sky, fontWeight: 'bold' },
    { tag: tags.strong, color: colors.maroon, fontWeight: 'bold' },
    { tag: tags.emphasis, color: colors.pink, fontStyle: 'italic' },
    { tag: tags.strikethrough, color: colors.overlay1, textDecoration: 'line-through' },
    { tag: tags.link, color: colors.blue, textDecoration: 'underline' },
    { tag: tags.url, color: colors.sapphire },
    { tag: tags.monospace, color: colors.green, fontFamily: 'monospace' },
    { tag: tags.quote, color: colors.overlay1, fontStyle: 'italic' },
    { tag: tags.list, color: colors.mauve },
    { tag: tags.meta, color: colors.overlay0 },
    { tag: tags.comment, color: colors.overlay0, fontStyle: 'italic' },
    { tag: tags.processingInstruction, color: colors.overlay0 }, // frontmatter
    { tag: tags.keyword, color: colors.mauve },
    { tag: tags.string, color: colors.green },
    { tag: tags.number, color: colors.peach },
    { tag: tags.bool, color: colors.peach },
    { tag: tags.null, color: colors.peach },
    { tag: tags.operator, color: colors.sky },
    { tag: tags.punctuation, color: colors.overlay2 },
    { tag: tags.bracket, color: colors.overlay2 },
    { tag: tags.className, color: colors.yellow },
    { tag: tags.function(tags.variableName), color: colors.blue },
    { tag: tags.definition(tags.variableName), color: colors.flamingo },
    { tag: tags.propertyName, color: colors.lavender },
  ]);
  
  return syntaxHighlighting(highlightStyle);
}

// Legacy export for backward compatibility
export const notnativeSyntax = createSyntaxHighlighting();
export const notnativeHighlight = HighlightStyle.define([]);
