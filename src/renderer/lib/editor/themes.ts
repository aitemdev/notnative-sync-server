import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// Catppuccin Mocha color palette
const colors = {
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

// Tema oscuro NotNative (Catppuccin Mocha)
export const notnativeDark: Extension = EditorView.theme({
  '&': {
    backgroundColor: colors.base,
    color: colors.text,
  },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
    fontSize: '14px',
    lineHeight: '1.6',
    caretColor: colors.rosewater,
  },
  '.cm-gutters': {
    backgroundColor: colors.mantle,
    color: colors.overlay0,
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: colors.surface0,
    color: colors.text,
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
    borderLeftColor: colors.rosewater,
    borderLeftWidth: '2px',
  },
  '.cm-matchingBracket': {
    backgroundColor: colors.surface1,
    outline: `1px solid ${colors.overlay0}`,
  },
  // Vim visual mode selection
  '.cm-fat-cursor': {
    backgroundColor: `${colors.mauve}80!important`,
    color: colors.base,
  },
  '.cm-vim-panel': {
    backgroundColor: colors.mantle,
    color: colors.text,
    padding: '4px 8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
  },
  '.cm-vim-panel input': {
    backgroundColor: 'transparent',
    color: colors.text,
    border: 'none',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  },
  // Search highlights
  '.cm-searchMatch': {
    backgroundColor: `${colors.peach}40`,
    outline: `1px solid ${colors.peach}`,
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: `${colors.yellow}60`,
  },
  // Line numbers
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 16px',
    minWidth: '40px',
  },
  // Scrollbar
  '&::-webkit-scrollbar': {
    width: '8px',
    height: '8px',
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: colors.mantle,
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: colors.surface1,
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: colors.surface2,
  },
}, { dark: true });

// Syntax highlighting para Markdown
export const notnativeHighlight = HighlightStyle.define([
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

// Tema claro (Catppuccin Latte)
const lightColors = {
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

export const notnativeLight: Extension = EditorView.theme({
  '&': {
    backgroundColor: lightColors.base,
    color: lightColors.text,
  },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
    fontSize: '14px',
    lineHeight: '1.6',
    caretColor: lightColors.rosewater,
  },
  '.cm-gutters': {
    backgroundColor: lightColors.mantle,
    color: lightColors.overlay0,
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: lightColors.surface0,
  },
  '.cm-activeLine': {
    backgroundColor: `${lightColors.surface0}80`,
  },
  '.cm-cursor': {
    borderLeftColor: lightColors.rosewater,
    borderLeftWidth: '2px',
  },
}, { dark: false });

export const notnativeSyntax = syntaxHighlighting(notnativeHighlight);
