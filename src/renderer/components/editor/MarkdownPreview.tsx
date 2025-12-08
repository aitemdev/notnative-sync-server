import { forwardRef, ReactNode, useCallback, useMemo } from 'react';
import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../../stores/app-store';
import { useNotes } from '../../hooks/useNotes';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
}

// Markdown components configuration for consistent styling
const baseMarkdownComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-4 leading-relaxed">{children}</p>
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-2xl font-bold mb-4 mt-6 text-text border-b border-surface0 pb-2">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-xl font-bold mb-3 mt-5 text-text">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-lg font-semibold mb-2 mt-4 text-text">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-base font-semibold mb-2 mt-3 text-text">{children}</h4>
  ),
  h5: ({ children }: { children?: ReactNode }) => (
    <h5 className="text-sm font-semibold mb-2 mt-3 text-text">{children}</h5>
  ),
  h6: ({ children }: { children?: ReactNode }) => (
    <h6 className="text-sm font-medium mb-2 mt-3 text-subtext0">{children}</h6>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-4 pl-6 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-4 pl-6 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-4 border-lavender pl-4 py-1 my-4 italic text-subtext0 bg-surface0/30 rounded-r">
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }: { className?: string; children?: ReactNode }) => {
    const isInline = !className;
    return isInline ? (
      <code className="px-1.5 py-0.5 rounded bg-surface1 text-lavender text-sm font-mono" {...props}>
        {children}
      </code>
    ) : (
      <code className={`block p-4 rounded-lg bg-surface0 text-sm font-mono overflow-x-auto ${className || ''}`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="mb-4 rounded-lg overflow-hidden">{children}</pre>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-bold text-text">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  hr: () => <hr className="my-6 border-surface0" />,
  table: ({ children }: { children?: ReactNode }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full border-collapse border border-surface0 rounded-lg overflow-hidden">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <thead className="bg-surface0">{children}</thead>
  ),
  tbody: ({ children }: { children?: ReactNode }) => (
    <tbody className="divide-y divide-surface0">{children}</tbody>
  ),
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="hover:bg-surface0/50 transition-colors">{children}</tr>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="px-4 py-2 text-left font-semibold text-text border-b border-surface1">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="px-4 py-2 text-subtext1">{children}</td>
  ),
  // img component is defined dynamically in MarkdownPreview to resolve relative paths
  input: ({ type, checked, disabled }: { type?: string; checked?: boolean; disabled?: boolean }) => {
    if (type === 'checkbox') {
      return (
        <input 
          type="checkbox" 
          checked={checked} 
          disabled={disabled}
          className="mr-2 rounded border-surface1 text-lavender focus:ring-lavender"
          readOnly
        />
      );
    }
    return <input type={type} disabled={disabled} />;
  },
};

// Helper function to process children and convert wikilinks [[note]] to clickable spans
function processChildrenForWikilinks(
  children: ReactNode,
  onNoteClick: (name: string) => void
): ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === 'string') {
      // Check if the text contains wikilinks
      const regex = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
      const parts: ReactNode[] = [];
      let lastIndex = 0;
      let match;
      let key = 0;

      while ((match = regex.exec(child)) !== null) {
        // Add text before the wikilink
        if (match.index > lastIndex) {
          parts.push(child.slice(lastIndex, match.index));
        }

        const target = match[1].trim();
        const display = match[2]?.trim() || target;

        // Add the wikilink as a clickable span
        parts.push(
          <span
            key={`wikilink-${key++}`}
            onClick={() => onNoteClick(target)}
            className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded bg-surface0 hover:bg-surface1 
                       text-green hover:text-teal transition-colors cursor-pointer font-medium text-sm
                       border border-surface1 hover:border-green/50"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNoteClick(target);
              }
            }}
          >
            <span className="text-xs">📄</span>
            {display}
          </span>
        );

        lastIndex = regex.lastIndex;
      }

      // Add remaining text
      if (lastIndex < child.length) {
        parts.push(child.slice(lastIndex));
      }

      // Return processed parts if we found wikilinks, otherwise return original string
      return parts.length > 0 ? <>{parts}</> : child;
    }
    return child;
  });
}

const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(
  ({ content, className = '', onScroll }, ref) => {
    const notes = useAppStore(state => state.notes);
    const currentNote = useAppStore(state => state.currentNote);
    const { openNote } = useNotes();

    const noteDir = useMemo(() => {
      if (!currentNote?.path) return null;
      const normalized = currentNote.path.replace(/\\/g, '/');
      const lastSlash = normalized.lastIndexOf('/');
      return lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : null;
    }, [currentNote?.path]);

    const resolveImageSrc = useCallback((src?: string) => {
      if (!src) return src;
      // Already absolute (http, https, data, local-file)
      if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('local-file://')) {
        return src;
      }
      
      // file:// URLs - convert to local-file:// for Electron security
      if (src.startsWith('file://')) {
        return src.replace('file://', 'local-file://');
      }

      // Decode src to handle cases where it's already encoded (e.g. %20 for spaces)
      let decodedSrc = src;
      try {
        decodedSrc = decodeURIComponent(src);
      } catch (e) {
        console.warn('Failed to decode image src:', src);
      }

      // Absolute filesystem path
      const isAbsoluteFs = decodedSrc.startsWith('/') || /^[a-zA-Z]:[\/]/.test(decodedSrc);
      if (isAbsoluteFs) {
        const normalized = decodedSrc.replace(/\\/g, '/');
        const encoded = normalized.split('/').map(seg => encodeURIComponent(seg)).join('/');
        return `local-file://${encoded}`;
      }

      if (!noteDir) return src;

      // Build a local-file:// URL relative to the note directory
      const base = noteDir.endsWith('/') ? noteDir : `${noteDir}/`;
      const cleaned = decodedSrc.startsWith('./') ? decodedSrc.slice(2) : decodedSrc;
      const joined = `${base}${cleaned}`.replace(/\/+/g, '/');
      // Encode each segment to handle spaces and special chars
      const encoded = joined.split('/').map(seg => encodeURIComponent(seg)).join('/');
      const resolved = `local-file://${encoded}`;
      return resolved;
    }, [noteDir]);

    // Handle wiki-link click - navigate to the note
    const handleNoteClick = useCallback(async (noteName: string) => {
      // Find note by name (case-insensitive)
      // Support both "note" and "folder/note" formats
      const note = notes.find(n => {
        const fullName = n.folder ? `${n.folder}/${n.name}` : n.name;
        return (
          n.name.toLowerCase() === noteName.toLowerCase() ||
          fullName.toLowerCase() === noteName.toLowerCase()
        );
      });
      
      if (note) {
        await openNote(note);
      } else {
        console.warn(`Note not found: ${noteName}`);
      }
    }, [notes, openNote]);

    const markdownComponents: Components = useMemo(() => ({
      ...baseMarkdownComponents,
      // Process text nodes to detect and render wikilinks
      p: ({ children }) => {
        const processedChildren = processChildrenForWikilinks(children, handleNoteClick);
        return <p className="mb-4 leading-relaxed">{processedChildren}</p>;
      },
      li: ({ children }) => {
        const processedChildren = processChildrenForWikilinks(children, handleNoteClick);
        return <li className="leading-relaxed">{processedChildren}</li>;
      },
      h1: ({ children }) => {
        const processedChildren = processChildrenForWikilinks(children, handleNoteClick);
        return <h1 className="text-2xl font-bold mb-4 mt-6 text-text border-b border-surface0 pb-2">{processedChildren}</h1>;
      },
      h2: ({ children }) => {
        const processedChildren = processChildrenForWikilinks(children, handleNoteClick);
        return <h2 className="text-xl font-bold mb-3 mt-5 text-text">{processedChildren}</h2>;
      },
      h3: ({ children }) => {
        const processedChildren = processChildrenForWikilinks(children, handleNoteClick);
        return <h3 className="text-lg font-semibold mb-2 mt-4 text-text">{processedChildren}</h3>;
      },
      h4: ({ children }) => {
        const processedChildren = processChildrenForWikilinks(children, handleNoteClick);
        return <h4 className="text-base font-semibold mb-2 mt-3 text-text">{processedChildren}</h4>;
      },
      h5: ({ children }) => {
        const processedChildren = processChildrenForWikilinks(children, handleNoteClick);
        return <h5 className="text-sm font-semibold mb-2 mt-3 text-text">{processedChildren}</h5>;
      },
      h6: ({ children }) => {
        const processedChildren = processChildrenForWikilinks(children, handleNoteClick);
        return <h6 className="text-sm font-medium mb-2 mt-3 text-subtext0">{processedChildren}</h6>;
      },
      img: ({ src, alt, ...props }) => {
        const resolved = resolveImageSrc(src);
        return (
          <img 
            src={resolved} 
            alt={alt || ''} 
            className="max-w-full h-auto rounded-lg my-4 shadow-lg"
            loading="lazy"
          />
        );
      },
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        // Check if it's a wikilink (special internal link format)
        if (href?.startsWith('wikilink:')) {
          const target = href.replace('wikilink:', '');
          const extractText = (node: ReactNode): string => {
            if (typeof node === 'string') return node;
            if (typeof node === 'number') return String(node);
            if (Array.isArray(node)) return node.map(extractText).join('');
            if (node && typeof node === 'object' && 'props' in node) {
              return extractText((node as any).props?.children);
            }
            return '';
          };
          const displayText = extractText(children);
          
          return (
            <span
              onClick={() => handleNoteClick(target)}
              className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded bg-surface0 hover:bg-surface1 
                         text-green hover:text-teal transition-colors cursor-pointer font-medium text-sm
                         border border-surface1 hover:border-green/50"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleNoteClick(target);
                }
              }}
            >
              <span className="text-xs">📄</span>
              {displayText}
            </span>
          );
        }
        
        // Check if it's an external URL
        const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
        
        if (isExternal) {
          return (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-lavender hover:text-mauve underline underline-offset-2 transition-colors"
            >
              {children}
            </a>
          );
        }
        
        // Extract text from children (could be string, array, or React elements)
        const extractText = (node: ReactNode): string => {
          if (typeof node === 'string') return node;
          if (typeof node === 'number') return String(node);
          if (Array.isArray(node)) return node.map(extractText).join('');
          if (node && typeof node === 'object' && 'props' in node) {
            return extractText((node as any).props?.children);
          }
          return '';
        };
        
        const childText = extractText(children);
        
        // Check if it's a file attachment (has emoji prefix or is in .assets folder)
        const isAttachment = href && (
          href.includes('.assets/') || 
          /^[📎📄📝📊📦🎵🎬📃📜🐍☕⚙️🌐🎨🔧]/.test(childText)
        );
        
        if (isAttachment) {
          // Prefer filename from href to avoid stray glyphs from markdown text
          const hrefName = href ? decodeURIComponent(href).split(/[\\/]/).pop() || '' : '';
          const match = childText.match(/^([📎📄📝📊📦🎵🎬📃📜🐍☕⚙️🌐🎨🔧])?\s*(.+)$/);
          const filename = hrefName || match?.[2] || childText;
          const ext = filename.includes('.') ? filename.split('.').pop()?.toUpperCase() : null;
          
          // Resolve the file path like images
          const resolvedPath = href ? resolveImageSrc(href) : '';
          // Convert local-file:// back to absolute path for shell.openPath
          const absolutePath = resolvedPath?.startsWith('local-file://') 
            ? decodeURIComponent(resolvedPath.replace('local-file://', ''))
            : href || '';
          
          // Render as a button-like attachment (badge with extension + filename) and a Save action
          return (
            <div className="inline-flex items-center gap-2 flex-wrap my-1">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  window.electron.shell.openPath(absolutePath).catch(err => {
                    console.error('Failed to open attachment:', err);
                  });
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface0 hover:bg-surface1 border border-surface1 rounded-lg text-text hover:text-lavender transition-colors cursor-pointer text-sm"
              >
                <span className="px-2 py-0.5 rounded-full bg-surface1 border border-surface2 text-[11px] text-subtext0 uppercase tracking-wide">
                  {ext || 'FILE'}
                </span>
                <span className="font-medium text-left whitespace-pre-wrap break-words">{filename}</span>
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  window.electron.files.saveAs(absolutePath).catch(err => {
                    console.error('Failed to save attachment:', err);
                  });
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-surface1 bg-surface0 hover:bg-surface1 text-subtext0 hover:text-text transition-colors"
              >
                Guardar
              </button>
            </div>
          );
        }
        
        // Regular internal link
        return (
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-lavender hover:text-mauve underline underline-offset-2 transition-colors"
          >
            {children}
          </a>
        );
      },
    }), [resolveImageSrc, handleNoteClick]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      if (onScroll) {
        const target = e.currentTarget;
        onScroll(target.scrollTop, target.scrollHeight, target.clientHeight);
      }
    }, [onScroll]);

    // Handle keyboard navigation for scrolling
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      const container = e.currentTarget;
      const scrollAmount = 40; // pixels to scroll per key press
      const pageScrollAmount = container.clientHeight * 0.8;

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          container.scrollTop += scrollAmount;
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          container.scrollTop -= scrollAmount;
          break;
        case 'PageDown':
        case ' ':
          e.preventDefault();
          container.scrollTop += pageScrollAmount;
          break;
        case 'PageUp':
          e.preventDefault();
          container.scrollTop -= pageScrollAmount;
          break;
        case 'Home':
        case 'g':
          if (e.key === 'g' && !e.ctrlKey) break; // Only handle 'g' with Ctrl or just Home
          e.preventDefault();
          container.scrollTop = 0;
          break;
        case 'End':
        case 'G':
          e.preventDefault();
          container.scrollTop = container.scrollHeight;
          break;
      }
    }, []);

    return (
      <div 
        ref={ref}
        className={`h-full overflow-y-auto px-8 py-6 bg-base text-text prose-container ${className} focus:outline-none`}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div className="max-w-3xl mx-auto">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }
);

MarkdownPreview.displayName = 'MarkdownPreview';

export default MarkdownPreview;
