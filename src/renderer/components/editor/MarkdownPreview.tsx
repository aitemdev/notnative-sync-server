import { forwardRef, ReactNode, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../../stores/app-store';
import { useNotes } from '../../hooks/useNotes';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
}

// Markdown components configuration for consistent styling
const markdownComponents = {
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
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="text-lavender hover:text-mauve underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
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
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img 
      src={src} 
      alt={alt} 
      className="max-w-full h-auto rounded-lg my-4 shadow-lg"
      loading="lazy"
    />
  ),
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

// Component to render wiki-links [[note]] as clickable buttons
function WikiLinkContent({ 
  content, 
  onNoteClick 
}: { 
  content: string; 
  onNoteClick: (name: string) => void;
}) {
  const parts: ReactNode[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <ReactMarkdown 
          key={`md-${key++}`} 
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {textBefore}
        </ReactMarkdown>
      );
    }
    
    // Add the wiki-link as a clickable button
    const noteName = match[1];
    parts.push(
      <button
        key={`link-${key++}`}
        type="button"
        onClick={() => onNoteClick(noteName)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface0 hover:bg-surface1 
                   text-green hover:text-teal transition-colors cursor-pointer font-medium text-sm
                   border border-surface1 hover:border-green/50"
      >
        <span className="text-xs">📄</span>
        {noteName}
      </button>
    );
    
    lastIndex = regex.lastIndex;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    const textAfter = content.slice(lastIndex);
    parts.push(
      <ReactMarkdown 
        key={`md-${key++}`} 
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {textAfter}
      </ReactMarkdown>
    );
  }
  
  // If no wiki-links found, render normal markdown
  if (parts.length === 0) {
    return (
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    );
  }
  
  return <>{parts}</>;
}

const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(
  ({ content, className = '', onScroll }, ref) => {
    const { notes } = useAppStore();
    const { openNote } = useNotes();

    // Handle wiki-link click - navigate to the note
    const handleNoteClick = useCallback(async (noteName: string) => {
      // Find note by name (case-insensitive, without extension)
      const note = notes.find(n => 
        n.name.toLowerCase() === noteName.toLowerCase() ||
        n.name.toLowerCase() === `${noteName.toLowerCase()}.md`
      );
      
      if (note) {
        await openNote(note);
      } else {
        console.warn(`Note not found: ${noteName}`);
        // Could show a toast or offer to create the note
      }
    }, [notes, openNote]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      if (onScroll) {
        const target = e.currentTarget;
        onScroll(target.scrollTop, target.scrollHeight, target.clientHeight);
      }
    }, [onScroll]);

    return (
      <div 
        ref={ref}
        className={`h-full overflow-y-auto px-8 py-6 bg-base text-text prose-container ${className}`}
        onScroll={handleScroll}
      >
        <div className="max-w-3xl mx-auto">
          <WikiLinkContent content={content} onNoteClick={handleNoteClick} />
        </div>
      </div>
    );
  }
);

MarkdownPreview.displayName = 'MarkdownPreview';

export default MarkdownPreview;
