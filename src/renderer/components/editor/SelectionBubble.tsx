import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Send, X, Loader2, Check, Copy, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SelectionBubbleProps {
  selectedText: string;
  noteContent: string; // Full note content for context
  position: { x: number; y: number };
  onClose: () => void;
  onAskAI: (text: string, action: 'chat' | 'improve' | 'explain' | 'replace') => void;
  onReplaceText: (newText: string) => void;
}

export function SelectionBubble({
  selectedText,
  noteContent,
  position,
  onClose,
  onAskAI,
  onReplaceText,
}: SelectionBubbleProps) {
  const { t } = useTranslation();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Calculate position to keep bubble within viewport
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [isPositioned, setIsPositioned] = useState(false);

  // Position calculation - runs on initial render and when content changes
  useEffect(() => {
    if (bubbleRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (!bubbleRef.current) return;
        
        const rect = bubbleRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let x = isPositioned ? adjustedPosition.x : position.x;
        let y = isPositioned ? adjustedPosition.y : position.y;

        // Minimum margin from edges (especially for sidebar)
        const minMargin = 60;

        // Adjust horizontal position - keep away from sidebar
        if (x + rect.width > viewportWidth - minMargin) {
          x = viewportWidth - rect.width - minMargin;
        }
        if (x < minMargin) {
          x = minMargin;
        }

        // Adjust vertical position - check if bubble goes below viewport
        if (y + rect.height > viewportHeight - 20) {
          // Try to show above the original position
          const aboveY = position.y - rect.height - 30;
          if (aboveY >= 20) {
            y = aboveY;
          } else {
            // If can't fit above, position at top with margin
            y = 20;
          }
        }
        if (y < 20) {
          y = 20;
        }

        // Only update if position actually changed
        if (x !== adjustedPosition.x || y !== adjustedPosition.y) {
          setAdjustedPosition({ x, y });
        }
        
        if (!isPositioned) {
          setIsPositioned(true);
        }
      });
    }
  }, [position, aiResponse, isProcessing, isPositioned]);

  // Focus input when bubble opens
  useEffect(() => {
    // Small delay to ensure the bubble is rendered
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to bottom of response when it updates
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [aiResponse]);

  // Focus input after response is received
  useEffect(() => {
    if (aiResponse && !isProcessing) {
      // Small delay to ensure UI is updated
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [aiResponse, isProcessing]);

  // Handle Escape key to close
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (!bubbleRef.current) return;
      
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscapeKey, true);
    return () => window.removeEventListener('keydown', handleEscapeKey, true);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use capture phase
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [onClose]);

  // Define action handlers BEFORE the keyboard effect that uses them
  const handleAccept = useCallback(() => {
    if (aiResponse) {
      onReplaceText(aiResponse);
    }
  }, [aiResponse, onReplaceText]);

  const handleCopy = useCallback(async () => {
    if (aiResponse) {
      await navigator.clipboard.writeText(aiResponse);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [aiResponse]);

  const handleRetry = useCallback(() => {
    setAiResponse('');
    setError('');
    setPrompt('');
    inputRef.current?.focus();
  }, []);

  // Keyboard shortcuts effect - must be after handler definitions
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle if bubble exists
      if (!bubbleRef.current) return;
      
      // Keyboard shortcuts when there's a response
      if (aiResponse && !isProcessing) {
        // Ctrl+Enter or Cmd+Enter to accept
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          handleAccept();
          return;
        }
        // Ctrl+Shift+C to copy (avoid conflict with normal copy)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
          e.preventDefault();
          e.stopPropagation();
          handleCopy();
          return;
        }
        // Ctrl+R to retry
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
          e.preventDefault();
          e.stopPropagation();
          handleRetry();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [aiResponse, isProcessing, handleAccept, handleCopy, handleRetry]);

  const handleSubmit = async () => {
    if (!prompt.trim() && !aiResponse) return;
    
    setIsProcessing(true);
    setError('');
    
    try {
      // Build prompt with note context - IMPORTANT: make clear AI should NOT modify anything
      const contextSection = noteContent && noteContent !== selectedText 
        ? `\n\n[Contexto de la nota para referencia - NO modificar ni mencionar que lo has visto]:\n${noteContent.length > 2000 ? noteContent.slice(0, 2000) + '...' : noteContent}\n`
        : '';
      
      const systemInstruction = `IMPORTANTE: Eres un asistente de edición de texto. Tu ÚNICA función es sugerir texto alternativo o responder preguntas. 
NO tienes capacidad de modificar archivos, notas ni documentos directamente. 
NO digas cosas como "he actualizado", "he modificado" o "he cambiado" porque NO puedes hacerlo.
El usuario decidirá si acepta tu sugerencia o no.
Responde SOLO con el texto sugerido o la respuesta a la pregunta, sin explicaciones adicionales.`;

      const fullPrompt = prompt.trim() 
        ? `${systemInstruction}\n\nPetición del usuario: ${prompt}\n\nTexto seleccionado:\n"${selectedText}"${contextSection}`
        : `${systemInstruction}\n\nMejora el siguiente texto, haciéndolo más claro y conciso. Devuelve SOLO el texto mejorado:\n\n"${selectedText}"${contextSection}`;
      
      const response = await window.electron.ai.sendMessage(null, fullPrompt);
      
      if (response?.message?.content) {
        setAiResponse(response.message.content);
      }
    } catch (err) {
      console.error('Error with AI:', err);
      setError(t('ai.error', 'Error al procesar la solicitud'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // Prevent CodeMirror from capturing
    
    if (e.key === 'Enter' && !e.shiftKey && !(e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      ref={bubbleRef}
      className="fixed z-50 bg-mantle border border-surface0 rounded-lg shadow-2xl overflow-hidden transition-all duration-200 ease-out"
      style={{ 
        left: adjustedPosition.x, 
        top: adjustedPosition.y, 
        width: '380px',
        maxHeight: '400px',
        opacity: isPositioned ? 1 : 0,
        transform: isPositioned ? 'translateY(0)' : 'translateY(-10px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-surface0/50 border-b border-surface0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-lavender" />
          <span className="text-xs text-text font-medium">
            {t('ai.inlineChat', 'Chat Inline')}
          </span>
          <span className="text-xs text-subtext0 truncate max-w-[180px]">
            — {selectedText.length > 25 ? `${selectedText.slice(0, 25)}...` : selectedText}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface1 text-subtext0 hover:text-text transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* AI Response area */}
      {(aiResponse || isProcessing || error) && (
        <div 
          ref={responseRef}
          className="max-h-[200px] overflow-y-auto border-b border-surface0"
        >
          {isProcessing ? (
            <div className="p-3 flex items-center gap-2 text-subtext0">
              <Loader2 size={14} className="animate-spin text-lavender" />
              <span className="text-sm">{t('ai.thinking', 'Pensando...')}</span>
            </div>
          ) : error ? (
            <div className="p-3 text-sm text-red">{error}</div>
          ) : aiResponse ? (
            <div className="p-3">
              <pre className="text-sm text-text whitespace-pre-wrap font-sans leading-relaxed">
                {aiResponse}
              </pre>
            </div>
          ) : null}
        </div>
      )}

      {/* Action buttons for response */}
      {aiResponse && !isProcessing && (
        <div className="px-3 py-2 bg-surface0/30 border-b border-surface0 flex items-center gap-2">
          <button
            onClick={handleAccept}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green text-crust rounded hover:bg-teal transition-colors font-medium"
            title="Ctrl+Enter"
          >
            <Check size={12} />
            {t('ai.accept', 'Aceptar')}
            <kbd className="ml-1 px-1 py-0.5 text-[9px] bg-green/30 rounded">^↵</kbd>
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface1 text-text rounded hover:bg-surface2 transition-colors"
            title="Click to copy"
          >
            {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
            {copied ? t('ai.copied', 'Copiado') : t('ai.copy', 'Copiar')}
          </button>
          <button
            onClick={handleRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface1 text-text rounded hover:bg-surface2 transition-colors"
            title="Ctrl+R"
          >
            <RotateCcw size={12} />
            {t('ai.retry', 'Reintentar')}
            <kbd className="ml-1 px-1 py-0.5 text-[9px] bg-surface2 rounded">^R</kbd>
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('ai.askAnything', 'Pregunta algo sobre el texto seleccionado...')}
            disabled={isProcessing}
            className="flex-1 px-3 py-2 bg-surface0 border border-surface1 rounded text-sm text-text placeholder-subtext0 focus:outline-none focus:border-lavender disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={isProcessing}
            className="p-2 bg-lavender text-crust rounded hover:bg-mauve transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('ai.send', 'Enviar')}
          >
            {isProcessing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        
        {/* Quick actions */}
        {!aiResponse && !isProcessing && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button
              onClick={() => { setPrompt('Mejora este texto'); handleSubmit(); }}
              className="px-2 py-1 text-[11px] bg-surface0 text-subtext1 rounded hover:bg-surface1 hover:text-text transition-colors"
            >
              ✨ Mejorar
            </button>
            <button
              onClick={() => { setPrompt('Explica este texto'); handleSubmit(); }}
              className="px-2 py-1 text-[11px] bg-surface0 text-subtext1 rounded hover:bg-surface1 hover:text-text transition-colors"
            >
              💡 Explicar
            </button>
            <button
              onClick={() => { setPrompt('Resume este texto'); handleSubmit(); }}
              className="px-2 py-1 text-[11px] bg-surface0 text-subtext1 rounded hover:bg-surface1 hover:text-text transition-colors"
            >
              📝 Resumir
            </button>
            <button
              onClick={() => { setPrompt('Traduce al inglés'); handleSubmit(); }}
              className="px-2 py-1 text-[11px] bg-surface0 text-subtext1 rounded hover:bg-surface1 hover:text-text transition-colors"
            >
              🌐 Traducir
            </button>
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="px-3 py-1.5 border-t border-surface0 bg-surface0/30">
        <div className="flex items-center justify-between text-[10px] text-subtext0">
          {aiResponse && !isProcessing ? (
            <>
              <span>
                <kbd className="px-1 bg-surface1 rounded">Ctrl+↵</kbd> aceptar
              </span>
              <span>
                <kbd className="px-1 bg-surface1 rounded">Ctrl+R</kbd> reintentar
              </span>
              <span>
                <kbd className="px-1 bg-surface1 rounded">Esc</kbd> cerrar
              </span>
            </>
          ) : (
            <>
              <span>
                <kbd className="px-1 bg-surface1 rounded">Enter</kbd> enviar
              </span>
              <span>
                <kbd className="px-1 bg-surface1 rounded">Esc</kbd> cerrar
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SelectionBubble;
