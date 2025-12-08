import { Extension } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { autocompletion, Completion, CompletionContext } from '@codemirror/autocomplete';
import type { NoteMetadata } from '../../../shared/types';

/**
 * Widget for rendering wikilinks with color coding
 */
class WikilinkWidget extends WidgetType {
  constructor(
    readonly linkTarget: string,
    readonly exists: boolean,
    readonly displayText?: string
  ) {
    super();
  }

  eq(other: WikilinkWidget) {
    return other.linkTarget === this.linkTarget && 
           other.exists === this.exists &&
           other.displayText === this.displayText;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = `wikilink ${this.exists ? 'wikilink-valid' : 'wikilink-broken'}`;
    span.textContent = `[[${this.displayText || this.linkTarget}]]`;
    span.title = this.exists 
      ? `Link to: ${this.linkTarget}`
      : `Note not found: ${this.linkTarget}`;
    
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

/**
 * Extract wikilink syntax from content
 */
function extractWikilinks(doc: string): Array<{ from: number; to: number; target: string; display?: string }> {
  const regex = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links: Array<{ from: number; to: number; target: string; display?: string }> = [];
  let match;

  while ((match = regex.exec(doc)) !== null) {
    links.push({
      from: match.index,
      to: match.index + match[0].length,
      target: match[1].trim(),
      display: match[2]?.trim(),
    });
  }

  return links;
}

/**
 * Check if a note name exists in the notes list
 */
function noteExists(target: string, notes: NoteMetadata[]): boolean {
  // Try exact name match
  if (notes.some(n => n.name === target)) {
    return true;
  }

  // Try folder/name match
  if (target.includes('/')) {
    const lastSlash = target.lastIndexOf('/');
    const folder = target.substring(0, lastSlash);
    const name = target.substring(lastSlash + 1);
    return notes.some(n => n.name === name && n.folder === folder);
  }

  // Try case-insensitive match
  const lowerTarget = target.toLowerCase();
  return notes.some(n => n.name.toLowerCase() === lowerTarget);
}

/**
 * ViewPlugin to decorate wikilinks with color coding
 */
function wikilinkDecorations(notes: NoteMetadata[]) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const decorations: any[] = [];
        const doc = view.state.doc.toString();
        const links = extractWikilinks(doc);

        for (const link of links) {
          const exists = noteExists(link.target, notes);
          
          // Add a mark decoration for the entire link
          const markClass = exists ? 'cm-wikilink-valid' : 'cm-wikilink-broken';
          decorations.push(
            Decoration.mark({
              class: markClass,
              attributes: {
                title: exists ? `Link to: ${link.target}` : `Note not found: ${link.target}`,
              },
            }).range(link.from, link.to)
          );
        }

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

/**
 * Autocompletion for wikilinks
 * Triggers when user types [[ and shows list of available notes
 */
function wikilinkCompletion(notes: NoteMetadata[]) {
  return autocompletion({
    override: [
      (context: CompletionContext) => {
        const { state, pos } = context;
        const line = state.doc.lineAt(pos);
        const textBefore = line.text.slice(0, pos - line.from);

        // Check if we're inside a wikilink [[ ... ]]
        const match = textBefore.match(/\[\[([^\]]*?)$/);
        if (!match) {
          return null;
        }

        const searchTerm = match[1].toLowerCase();
        const from = pos - match[1].length;

        // Filter notes by search term
        const options: Completion[] = notes
          .filter(note => {
            const fullName = note.folder ? `${note.folder}/${note.name}` : note.name;
            return (
              note.name.toLowerCase().includes(searchTerm) ||
              fullName.toLowerCase().includes(searchTerm)
            );
          })
          .sort((a, b) => {
            // Prioritize exact name matches
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            
            if (aName.startsWith(searchTerm) && !bName.startsWith(searchTerm)) return -1;
            if (!aName.startsWith(searchTerm) && bName.startsWith(searchTerm)) return 1;
            
            return aName.localeCompare(bName);
          })
          .slice(0, 20) // Limit to top 20 results
          .map(note => {
            const fullName = note.folder ? `${note.folder}/${note.name}` : note.name;
            const displayLabel = note.folder ? `${note.name} (${note.folder})` : note.name;
            
            return {
              label: displayLabel,
              apply: fullName,
              type: 'text',
              detail: note.folder || 'root',
              info: `Created: ${note.createdAt.toLocaleDateString()}`,
            };
          });

        return {
          from,
          options,
          validFor: /^[^\]]*$/,
        };
      },
    ],
    // Make completion case-insensitive
    activateOnTyping: true,
    closeOnBlur: true,
    defaultKeymap: true,
  });
}

/**
 * Theme for wikilink styling
 */
const wikilinkTheme = EditorView.baseTheme({
  '.cm-wikilink-valid': {
    color: 'var(--blue)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--blue)',
    textDecorationThickness: '1px',
    cursor: 'pointer',
    fontWeight: '500',
    '&:hover': {
      backgroundColor: 'var(--blue)15',
      textDecorationThickness: '2px',
    },
  },
  '.cm-wikilink-broken': {
    color: 'var(--red)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--red)',
    textDecorationStyle: 'wavy',
    textDecorationThickness: '1px',
    cursor: 'help',
    fontWeight: '500',
    '&:hover': {
      backgroundColor: 'var(--red)15',
    },
  },
  '.wikilink': {
    display: 'inline',
    padding: '0 2px',
    borderRadius: '2px',
  },
  '.wikilink-valid': {
    backgroundColor: 'var(--blue)15',
  },
  '.wikilink-broken': {
    backgroundColor: 'var(--red)15',
  },
  // Autocomplete styling
  '.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--mantle)',
    border: '1px solid var(--surface0)',
    borderRadius: '4px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
  },
  '.cm-tooltip-autocomplete ul': {
    maxHeight: '300px',
    fontFamily: 'inherit',
  },
  '.cm-tooltip-autocomplete li': {
    padding: '4px 8px',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  '.cm-tooltip-autocomplete li[aria-selected]': {
    backgroundColor: 'var(--surface1)',
    color: 'var(--lavender)',
  },
  '.cm-completionLabel': {
    color: 'var(--text)',
  },
  '.cm-completionDetail': {
    color: 'var(--subtext0)',
    fontSize: '0.85em',
    marginLeft: '8px',
  },
  '.cm-completionInfo': {
    padding: '4px 8px',
    backgroundColor: 'var(--surface0)',
    borderLeft: '1px solid var(--surface1)',
    color: 'var(--subtext1)',
    fontSize: '0.9em',
  },
});

/**
 * Create the complete wikilink extension
 * Includes autocompletion, decorations, and click handling
 */
export function createWikilinkExtension(
  notes: NoteMetadata[],
  onWikilinkClick?: (target: string) => void
): Extension {
  const extensions: Extension[] = [
    wikilinkDecorations(notes),
    wikilinkCompletion(notes),
    wikilinkTheme,
  ];

  // Add click handler if provided - use mousedown for better compatibility with Vim
  if (onWikilinkClick) {
    extensions.push(
      EditorView.domEventHandlers({
        mousedown: (event, view) => {
          // Only handle Ctrl/Cmd+Click
          if (!event.ctrlKey && !event.metaKey) {
            return false;
          }
          
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            const doc = view.state.doc.toString();
            const links = extractWikilinks(doc);
            
            for (const link of links) {
              if (pos >= link.from && pos <= link.to) {
                event.preventDefault();
                event.stopPropagation();
                onWikilinkClick(link.target);
                return true;
              }
            }
          }
          return false;
        },
      })
    );
  }

  return extensions;
}

/**
 * Helper to extract wikilink at cursor position
 */
export function getWikilinkAtPosition(doc: string, pos: number): string | null {
  const links = extractWikilinks(doc);
  for (const link of links) {
    if (pos >= link.from && pos <= link.to) {
      return link.target;
    }
  }
  return null;
}
