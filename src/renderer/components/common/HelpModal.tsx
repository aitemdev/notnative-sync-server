import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, BookOpen } from 'lucide-react';

const KEYBINDINGS_CONTENT = `# NotNative Electron – Keybindings / Atajos

> PC usa \`Ctrl\`, macOS usa \`Cmd\`. // PC uses \`Ctrl\`, macOS uses \`Cmd\`.

## English
- **Navigation & panels**: \`Ctrl+E\` cycle views (edit → split → preview); \`Ctrl+T\` open sidebar nav; \`Esc\` closes sidebar/nav/chat; \`Ctrl+Shift+C\` toggle AI chat; \`Ctrl+,\` open settings; \`Ctrl+Shift+N\` open Quick Note.
- **Search**: \`Ctrl+F\` global search; \`Alt+F\` search in current note; in-note \`Enter\`/\`Shift+Enter\` next/prev match; global results navigate with ↑/↓ + \`Enter\`.
- **Editor**: \`Ctrl+S\` save note; \`Ctrl+K\` with selection opens AI bubble.
- **Vim Editor**: full Vim modes (\`Esc\` back to Normal); \`Ctrl+S\` save; \`Ctrl+K\` AI bubble; \`:w\` save; \`:q\` quit (logs only today); \`:wq\` save+quit; \`:e <note>\` open (logs only today); \`:preview\` toggle view (same as \`Ctrl+E\`); paste/drag files inserts link/image (50MB cap, dangerous ext blocked).
- **View mode buttons**: tooltips show \`Ctrl+E\` for cycling views.
- **Quick Note window**: \`Ctrl+Enter\` save; \`Esc\` close.
- **Sidebar quick search**: hint shows \`Ctrl+P\` to filter quickly without global overlay.
- **Other**: attachments popover opens on click, save via button; renaming notes uses \`Enter\` to confirm / \`Esc\` to cancel.
- **By context**: Global \`Ctrl+E\`, \`Ctrl+T\`, \`Ctrl+Shift+C\`, \`Ctrl+,\`, \`Ctrl+Shift+N\`, \`Ctrl+F\`, \`Alt+F\`, \`Esc\`. Editor \`Ctrl+S\`, \`Ctrl+K\`, \`Ctrl+E\`. Search overlay \`Enter\`/\`Shift+Enter\`, \`Esc\`, \`Ctrl+F\`/\`Alt+F\`. Quick Note \`Ctrl+Enter\`, \`Esc\`. Sidebar quick search \`Ctrl+P\`.

## Español
- **Navegación y paneles**: \`Ctrl+E\` alterna vistas (edición → dividido → preview); \`Ctrl+T\` abre navegación del sidebar; \`Esc\` cierra sidebar/nav/chat; \`Ctrl+Shift+C\` muestra/oculta chat AI; \`Ctrl+,\` abre ajustes; \`Ctrl+Shift+N\` abre "Nota rápida".
- **Búsqueda**: \`Ctrl+F\` búsqueda global; \`Alt+F\` búsqueda en la nota; dentro de la nota \`Enter\`/\`Shift+Enter\` siguiente/anterior coincidencia; en resultados globales navega con ↑/↓ + \`Enter\`.
- **Editor**: \`Ctrl+S\` guarda la nota; \`Ctrl+K\` con selección abre el bubble de AI.
- **Vim Editor**: modos Vim completos (\`Esc\` vuelve a Normal); \`Ctrl+S\` guarda; \`Ctrl+K\` abre bubble de AI; \`:w\` guarda; \`:q\` salir (hoy solo registra); \`:wq\` guarda y sale; \`:e <nota>\` abre (hoy solo registra); \`:preview\` alterna vista (igual a \`Ctrl+E\`); pegar/arrastrar archivos inserta enlace/imagen (límite 50MB, extensiones peligrosas bloqueadas).
- **Botones de vista**: los tooltips recuerdan \`Ctrl+E\` para ciclar vistas.
- **Nota rápida**: \`Ctrl+Enter\` guarda; \`Esc\` cierra.
- **Búsqueda rápida en sidebar**: pista \`Ctrl+P\` para filtrar sin abrir el overlay global.
- **Otros**: en el popover de adjuntos abre con clic y guarda con el botón; al renombrar, \`Enter\` confirma y \`Esc\` cancela.
- **Por contexto**: Global \`Ctrl+E\`, \`Ctrl+T\`, \`Ctrl+Shift+C\`, \`Ctrl+,\`, \`Ctrl+Shift+N\`, \`Ctrl+F\`, \`Alt+F\`, \`Esc\`. Editor \`Ctrl+S\`, \`Ctrl+K\`, \`Ctrl+E\`. Overlay \`Enter\`/\`Shift+Enter\`, \`Esc\`, \`Ctrl+F\`/\`Alt+F\`. Quick Note \`Ctrl+Enter\`, \`Esc\`. Sidebar quick search \`Ctrl+P\`.`;

const VIM_CHEATSHEET_CONTENT = `# Vim Editor – Cheat Sheet / Hoja de atajos

> Dentro del VimEditor (CodeMirror + vim mode). PC usa \`Ctrl\`, macOS usa \`Cmd\` para los atajos globales (guardar/AI) mencionados en \`KEYBINDINGS.md\`. // Inside VimEditor (CodeMirror + vim mode). PC uses \`Ctrl\`, macOS uses \`Cmd\` for global save/AI shortcuts in \`KEYBINDINGS.md\`.

## English
- **Modes**: \`Esc\` Normal; \`i\`/\`a\`/\`I\`/\`A\`/\`o\`/\`O\` enter Insert in different spots; \`v\` Visual char, \`V\` Visual line, \`Ctrl+v\` block/column.
- **Navigation**: \`h/j/k/l\`; \`w\` \`e\` \`b\` next/end/prev word; \`0\` \`^\` \`$\` line start/first non-space/end; \`gg\` / \`G\` to top/bottom; \`{\` / \`}\` prev/next paragraph; \`%\` matching bracket; \`fX\` / \`tX\` jump to/before next \`X\`, repeat with \`;\` / \`,\`.
- **Select**: all \`ggVG\`; word \`viw\`/\`vaw\`; line \`V\`; block \`Ctrl+v\` + arrows; paragraph \`vip\`/\`vap\`; sentence \`vis\`/\`vas\` (\`(\`/\`)\` to move sentences).
- **Edit/Delete/Copy**: \`x\`/\`X\` delete char; \`dw\`/\`db\`/\`de\` delete word forward/back/to end; \`dd\` cut line; \`D\` delete to line end; \`cc\` change line; \`C\` change to line end; \`cw\` change word; \`yy\` yank line; \`yw\` yank word; \`y$\` yank to line end; \`p\`/\`P\` paste after/before; \`u\` undo; \`Ctrl+r\` redo; \`J\` join next line.
- **Indent/Format**: \`>>\` / \`<<\` indent/unindent line; in Visual \`>\` / \`<\` indent selection; \`=\` auto-indent selection; \`gg=G\` re-indent whole file.
- **Search**: \`/text\` then \`Enter\` forward, \`?text\` backward; \`n\`/\`N\` next/prev; \`*\`/\`#\` word under cursor forward/back.
- **Replace helpers**: use change ops (\`cw\`, \`ciw\`, \`cip\`, \`cis\`) or AI bubble with \`Ctrl/Cmd+K\` on a selection.
- **Macros/Repeat**: \`.\` repeat last action; \`q{reg}\` … \`q\` record macro; \`@{reg}\` play (basic macros supported).
- **Ex commands**: \`:w\`, \`:q\`, \`:wq\`; \`:preview\` toggles view (same as \`Ctrl+E\`); \`:q\`/\`:e\` are placeholders logging only today.
- **Files/Images**: paste (\`Ctrl/Cmd+V\`) or drag a file to insert Markdown link/image (50MB limit, executables blocked).
- **Quick tips**: repeat with \`.\`; combine text-objects \`ciw\`/\`cip\`/\`cis\`; \`gg=G\` to tidy indentation.

## Español
- **Modos**: \`Esc\` Normal; \`i\`/\`a\`/\`I\`/\`A\`/\`o\`/\`O\` entran a Insert en distintas posiciones; \`v\` Visual por caracteres, \`V\` Visual de línea, \`Ctrl+v\` bloque/columna.
- **Navegación**: \`h/j/k/l\`; \`w\` \`e\` \`b\` siguiente/fin/anterior palabra; \`0\` \`^\` \`$\` inicio/primer no-espacio/fin de línea; \`gg\` / \`G\` al inicio/final; \`{\` / \`}\` párrafo anterior/siguiente; \`%\` par de paréntesis/llave; \`fX\` / \`tX\` salta a/antes de la siguiente \`X\`, repite con \`;\` / \`,\`.
- **Seleccionar**: todo \`ggVG\`; palabra \`viw\`/\`vaw\`; línea \`V\`; bloque \`Ctrl+v\` + cursores; párrafo \`vip\`/\`vap\`; frase \`vis\`/\`vas\` (\`(\`/\`)\` para moverte por frases).
- **Editar/Eliminar/Copiar**: \`x\`/\`X\` borra carácter; \`dw\`/\`db\`/\`de\` borra palabra adelante/atrás/hasta fin; \`dd\` corta línea; \`D\` borra hasta fin; \`cc\` cambia línea; \`C\` cambia hasta fin; \`cw\` cambia palabra; \`yy\` copia línea; \`yw\` copia palabra; \`y$\` copia hasta fin; \`p\`/\`P\` pega después/antes; \`u\` deshace; \`Ctrl+r\` rehace; \`J\` une con la siguiente línea.
- **Indentación/Formato**: \`>>\` / \`<<\` indenta/desindenta línea; en Visual \`>\` / \`<\` indenta/desindenta selección; \`=\` auto-indenta selección; \`gg=G\` reindenta todo.
- **Búsqueda**: \`/texto\` + \`Enter\` hacia adelante, \`?texto\` hacia atrás; \`n\`/\`N\` siguiente/anterior; \`*\`/\`#\` palabra bajo el cursor adelante/atrás.
- **Reemplazo ligero**: usa cambios \`cw\`/\`ciw\`/\`cip\`/\`cis\` o el bubble AI con \`Ctrl/Cmd+K\` sobre la selección.
- **Macros/Repetición**: \`.\` repite la última acción; \`q{reg}\` … \`q\` graba macro; \`@{reg}\` la ejecuta (macros básicas soportadas).
- **Comandos Ex**: \`:w\`, \`:q\`, \`:wq\`; \`:preview\` alterna vista (igual \`Ctrl+E\`); \`:q\`/\`:e\` hoy solo registran la acción.
- **Archivos/Imágenes**: pega (\`Ctrl/Cmd+V\`) o arrastra un archivo para insertar enlace/imagen Markdown (límite 50MB, ejecutables bloqueados).
- **Tips**: repite con \`.\`; combina objetos de texto \`ciw\`/\`cip\`/\`cis\`; \`gg=G\` para limpiar indentación.`;

type HelpSection = 'keybindings' | 'vim';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSection?: HelpSection;
}

export function HelpModal({ isOpen, onClose, defaultSection = 'keybindings' }: HelpModalProps) {
  const [activeSection, setActiveSection] = useState<HelpSection>(defaultSection);
  const [searchQuery, setSearchQuery] = useState('');

  // Update active section when defaultSection changes
  useEffect(() => {
    if (isOpen) {
      setActiveSection(defaultSection);
    }
  }, [defaultSection, isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const content = activeSection === 'keybindings' ? KEYBINDINGS_CONTENT : VIM_CHEATSHEET_CONTENT;

  // Filter content based on search query
  const filteredContent = useMemo(() => {
    if (!searchQuery.trim()) return content;
    
    const lines = content.split('\n');
    const query = searchQuery.toLowerCase();
    
    return lines
      .filter(line => line.toLowerCase().includes(query))
      .join('\n');
  }, [content, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-mantle rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface0">
          <div className="flex items-center gap-3">
            <BookOpen size={24} className="text-lavender" />
            <h2 className="text-xl font-bold text-text">Help / Ayuda</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface0 transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-subtext0" />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 p-4 border-b border-surface0">
          <button
            onClick={() => setActiveSection('keybindings')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeSection === 'keybindings'
                ? 'bg-lavender text-base'
                : 'bg-surface0 text-subtext0 hover:bg-surface1'
            }`}
          >
            Keybindings
          </button>
          <button
            onClick={() => setActiveSection('vim')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeSection === 'vim'
                ? 'bg-lavender text-base'
                : 'bg-surface0 text-subtext0 hover:bg-surface1'
            }`}
          >
            Vim Editor
          </button>
        </div>

        {/* Search bar */}
        <div className="p-4 border-b border-surface0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtext0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts... / Buscar atajos..."
              className="w-full pl-10 pr-4 py-2 bg-surface0 border border-surface1 rounded-lg text-text placeholder:text-subtext0 focus:outline-none focus:ring-2 focus:ring-lavender"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="prose prose-invert max-w-none">
            {filteredContent.split('\n').map((line, idx) => {
              // Render headers
              if (line.startsWith('# ')) {
                return <h1 key={idx} className="text-2xl font-bold text-text mb-4">{line.slice(2)}</h1>;
              }
              if (line.startsWith('## ')) {
                return <h2 key={idx} className="text-xl font-bold text-text mt-6 mb-3">{line.slice(3)}</h2>;
              }
              if (line.startsWith('> ')) {
                return <blockquote key={idx} className="border-l-4 border-lavender pl-4 italic text-subtext0 my-4">{line.slice(2)}</blockquote>;
              }
              
              // Render list items with inline code highlighting and bold text
              if (line.startsWith('- ')) {
                const text = line.slice(2);
                // Split by both code blocks and bold markers
                const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
                return (
                  <li key={idx} className="text-text mb-2 ml-4">
                    {parts.map((part, i) => {
                      if (part.startsWith('`') && part.endsWith('`')) {
                        return (
                          <code key={i} className="px-1.5 py-0.5 bg-surface0 text-lavender rounded text-sm font-mono">
                            {part.slice(1, -1)}
                          </code>
                        );
                      } else if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={i} className="font-bold text-text">{part.slice(2, -2)}</strong>;
                      } else {
                        return <span key={i}>{part}</span>;
                      }
                    })}
                  </li>
                );
              }
              
              // Empty lines
              if (!line.trim()) {
                return <div key={idx} className="h-2" />;
              }
              
              // Regular paragraphs with code and bold support
              const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
              return (
                <p key={idx} className="text-text mb-2">
                  {parts.map((part, i) => {
                    if (part.startsWith('`') && part.endsWith('`')) {
                      return (
                        <code key={i} className="px-1.5 py-0.5 bg-surface0 text-lavender rounded text-sm font-mono">
                          {part.slice(1, -1)}
                        </code>
                      );
                    } else if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={i} className="font-bold text-text">{part.slice(2, -2)}</strong>;
                    } else {
                      return <span key={i}>{part}</span>;
                    }
                  })}
                </p>
              );
            })}
          </div>

          {filteredContent.split('\n').filter(l => l.trim()).length === 0 && (
            <div className="text-center text-subtext0 py-12">
              <Search size={48} className="mx-auto mb-4 opacity-50" />
              <p>No results found / No se encontraron resultados</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface0 text-center text-xs text-subtext0">
          Press <kbd className="px-2 py-1 bg-surface0 rounded">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
