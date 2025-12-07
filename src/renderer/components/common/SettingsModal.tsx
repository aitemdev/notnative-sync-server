import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Sun, Moon, Monitor, Upload, Check, Palette, Type, Layout, Info, Brain, RefreshCw, Database, ChevronDown, Key } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useAppStore } from '../../stores/app-store';
import type { Theme, ThemeFile, ThemeColors } from '../../../shared/types/theme';
import { THEME_JSON_SCHEMA } from '../../../shared/types/theme';

type SettingsTab = 'appearance' | 'ai' | 'editor' | 'about';

/**
 * Hook to manage settings modal state globally
 */
let openSettingsModal: (() => void) | null = null;
let closeSettingsModal: (() => void) | null = null;

export function openSettings() {
  openSettingsModal?.();
}

export function closeSettings() {
  closeSettingsModal?.();
}

/**
 * Color preview swatch component
 */
function ColorSwatch({ color, name }: { color: string; name: string }) {
  return (
    <div 
      className="w-6 h-6 rounded-md border border-surface1 cursor-pointer hover:scale-110 transition-transform"
      style={{ backgroundColor: color }}
      title={`${name}: ${color}`}
    />
  );
}

/**
 * Theme preview card with live preview
 */
function ThemeCard({ 
  theme, 
  isSelected, 
  onSelect 
}: { 
  theme: Theme; 
  isSelected: boolean; 
  onSelect: () => void;
}) {
  const colors = theme.colors;
  
  return (
    <button
      onClick={onSelect}
      className={`
        relative p-3 rounded-lg border-2 transition-all text-left
        ${isSelected 
          ? 'border-lavender ring-2 ring-lavender/30' 
          : 'border-surface1 hover:border-surface2'
        }
      `}
      style={{ backgroundColor: colors.mantle }}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-lavender flex items-center justify-center">
          <Check size={12} className="text-base" />
        </div>
      )}
      
      {/* Mini preview */}
      <div 
        className="rounded-md mb-2 p-2 flex gap-1"
        style={{ backgroundColor: colors.base }}
      >
        {/* Fake sidebar */}
        <div 
          className="w-8 rounded-sm"
          style={{ backgroundColor: colors.mantle, height: 40 }}
        />
        {/* Fake content */}
        <div className="flex-1 space-y-1">
          <div 
            className="h-2 rounded-full w-3/4"
            style={{ backgroundColor: colors.text }}
          />
          <div 
            className="h-2 rounded-full w-1/2"
            style={{ backgroundColor: colors.subtext0 }}
          />
          <div 
            className="h-2 rounded-full w-2/3"
            style={{ backgroundColor: colors.overlay0 }}
          />
        </div>
      </div>
      
      {/* Theme info */}
      <div className="flex items-center gap-2">
        {theme.isDark ? (
          <Moon size={14} style={{ color: colors.blue }} />
        ) : (
          <Sun size={14} style={{ color: colors.yellow }} />
        )}
        <span className="text-sm font-medium" style={{ color: colors.text }}>
          {theme.name}
        </span>
      </div>
      
      {/* Color swatches preview */}
      <div className="flex gap-1 mt-2">
        <ColorSwatch color={colors.red} name="red" />
        <ColorSwatch color={colors.peach} name="peach" />
        <ColorSwatch color={colors.yellow} name="yellow" />
        <ColorSwatch color={colors.green} name="green" />
        <ColorSwatch color={colors.blue} name="blue" />
        <ColorSwatch color={colors.mauve} name="mauve" />
      </div>
    </button>
  );
}

/**
 * System theme option card
 */
function SystemThemeCard({ 
  isSelected, 
  onSelect 
}: { 
  isSelected: boolean; 
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        relative p-3 rounded-lg border-2 transition-all text-left bg-surface0
        ${isSelected 
          ? 'border-lavender ring-2 ring-lavender/30' 
          : 'border-surface1 hover:border-surface2'
        }
      `}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-lavender flex items-center justify-center">
          <Check size={12} className="text-base" />
        </div>
      )}
      
      {/* System icon preview */}
      <div className="rounded-md mb-2 p-2 bg-base flex items-center justify-center h-[56px]">
        <Monitor size={24} className="text-subtext0" />
      </div>
      
      <div className="flex items-center gap-2">
        <Monitor size={14} className="text-overlay0" />
        <span className="text-sm font-medium text-text">Sistema</span>
      </div>
      
      <p className="text-xs text-subtext0 mt-1">
        Sigue el tema del sistema
      </p>
    </button>
  );
}

/**
 * Import theme from JSON file
 */
function ImportThemeButton({ onImport }: { onImport: (theme: Theme) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ThemeFile;
      
      // Basic validation
      if (!data.meta?.id || !data.meta?.name || !data.colors) {
        throw new Error('Invalid theme file: missing required fields');
      }
      
      // Check all color fields exist
      const requiredColors = [
        'base', 'mantle', 'crust', 'surface0', 'surface1', 'surface2',
        'overlay0', 'overlay1', 'overlay2', 'subtext0', 'subtext1', 'text',
        'lavender', 'blue', 'sapphire', 'sky', 'teal', 'green',
        'yellow', 'peach', 'maroon', 'red', 'mauve', 'pink', 'flamingo', 'rosewater'
      ];
      
      for (const color of requiredColors) {
        if (!(color in data.colors)) {
          throw new Error(`Invalid theme file: missing color '${color}'`);
        }
      }
      
      const theme: Theme = {
        ...data.meta,
        colors: data.colors,
      };
      
      onImport(theme);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error importing theme');
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm"
      >
        <Upload size={16} />
        Importar tema
      </button>
      {error && (
        <p className="text-red text-xs mt-2">{error}</p>
      )}
    </div>
  );
}

/**
 * Appearance settings tab
 */
function AppearanceTab() {
  const { 
    currentTheme, 
    themePreference, 
    availableThemes, 
    setThemePreference,
    addCustomTheme,
    removeCustomTheme,
  } = useTheme();
  
  const customThemes = availableThemes.filter(t => t.id !== 'dark' && t.id !== 'light');
  
  return (
    <div className="space-y-6">
      {/* Theme selection */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Palette size={16} />
          Tema
        </h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Built-in themes */}
          {availableThemes
            .filter(t => t.id === 'dark' || t.id === 'light')
            .map(theme => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                isSelected={themePreference === theme.id}
                onSelect={() => setThemePreference(theme.id)}
              />
            ))
          }
          
          {/* System option */}
          <SystemThemeCard
            isSelected={themePreference === 'system'}
            onSelect={() => setThemePreference('system')}
          />
        </div>
      </div>
      
      {/* Custom themes */}
      {customThemes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Temas personalizados</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {customThemes.map(theme => (
              <div key={theme.id} className="relative">
                <ThemeCard
                  theme={theme}
                  isSelected={themePreference === theme.id}
                  onSelect={() => setThemePreference(theme.id)}
                />
                <button
                  onClick={() => removeCustomTheme(theme.id)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red text-base flex items-center justify-center hover:bg-maroon transition-colors"
                  title="Eliminar tema"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Import theme */}
      <div className="pt-4 border-t border-surface0">
        <ImportThemeButton onImport={addCustomTheme} />
        <p className="text-xs text-subtext0 mt-2">
          Importa un archivo JSON con el schema de colores de NotNative.
        </p>
      </div>
      
      {/* Current theme colors preview */}
      <div className="pt-4 border-t border-surface0">
        <h3 className="text-sm font-medium mb-3">Colores del tema actual</h3>
        <div className="grid grid-cols-7 gap-2">
          {Object.entries(currentTheme.colors).map(([name, color]) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <ColorSwatch color={color} name={name} />
              <span className="text-[10px] text-subtext0 truncate w-full text-center">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Editor settings tab
 */
function EditorTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Type size={16} />
          Tipografía
        </h3>
        <p className="text-sm text-subtext0">
          Configuración de tipografía (próximamente)
        </p>
      </div>
      
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Layout size={16} />
          Layout
        </h3>
        <p className="text-sm text-subtext0">
          Configuración de layout (próximamente)
        </p>
      </div>
    </div>
  );
}

/**
 * AI & Search settings tab
 */
function AITab() {
  const [isReindexing, setIsReindexing] = useState(false);
  const [stats, setStats] = useState<{ totalNotes: number; totalChunks: number; lastUpdated: Date | null } | null>(null);
  const [reindexResult, setReindexResult] = useState<{ indexed: number; errors: number } | null>(null);
  
  // API Key states
  const [apiKeyInfo, setApiKeyInfo] = useState<{ hasKey: boolean; maskedKey: string }>({ hasKey: false, maskedKey: '' });
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  
  // Model states
  const [chatModel, setChatModel] = useState<string>('');
  const [embeddingModel, setEmbeddingModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<{ chat: Array<{ id: string; name: string; contextLength: number; pricing: string }>; embedding: Array<{ id: string; name: string; pricing: string }> }>({ chat: [], embedding: [] });
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [chatModelChanged, setChatModelChanged] = useState(false);
  const [embeddingModelChanged, setEmbeddingModelChanged] = useState(false);
  
  // Load stats and models on mount
  useEffect(() => {
    loadApiKeyInfo();
    loadStats();
    loadModels();
    loadCurrentModels();
  }, []);
  
  const loadApiKeyInfo = async () => {
    try {
      const info = await window.electron.ai.getApiKey();
      setApiKeyInfo(info);
    } catch (error) {
      console.error('Failed to load API key info:', error);
    }
  };
  
  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) return;
    
    setSavingApiKey(true);
    try {
      const result = await window.electron.ai.setApiKey(newApiKey.trim());
      if (result.success) {
        setApiKeySaved(true);
        setShowApiKeyInput(false);
        setNewApiKey('');
        await loadApiKeyInfo();
        // Reload models with new API key
        await loadModels();
        setTimeout(() => setApiKeySaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
    } finally {
      setSavingApiKey(false);
    }
  };
  
  const loadStats = async () => {
    try {
      const result = await window.electron.embeddings.getStats();
      setStats(result);
    } catch (error) {
      console.error('Failed to load embedding stats:', error);
    }
  };
  
  const loadModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const result = await window.electron.ai.getModels();
      if ('error' in result && result.error) {
        setModelsError(result.error as string);
      } else {
        setAvailableModels(result);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      setModelsError('Error cargando modelos de OpenRouter');
    } finally {
      setLoadingModels(false);
    }
  };
  
  const loadCurrentModels = async () => {
    try {
      const [chat, embedding] = await Promise.all([
        window.electron.ai.getModel(),
        window.electron.embeddings.getModel(),
      ]);
      setChatModel(chat);
      setEmbeddingModel(embedding);
    } catch (error) {
      console.error('Failed to load current models:', error);
    }
  };
  
  const handleChatModelChange = async (newModel: string) => {
    setChatModel(newModel);
    try {
      await window.electron.ai.setModel(newModel);
      setChatModelChanged(true);
      setTimeout(() => setChatModelChanged(false), 3000);
    } catch (error) {
      console.error('Failed to set chat model:', error);
    }
  };
  
  const handleEmbeddingModelChange = async (newModel: string) => {
    setEmbeddingModel(newModel);
    try {
      await window.electron.embeddings.setModel(newModel);
      setEmbeddingModelChanged(true);
    } catch (error) {
      console.error('Failed to set embedding model:', error);
    }
  };
  
  const handleReindex = async () => {
    setIsReindexing(true);
    setReindexResult(null);
    setEmbeddingModelChanged(false);
    
    try {
      const result = await window.electron.embeddings.reindexAll();
      if (result.success) {
        setReindexResult({ indexed: result.indexed || 0, errors: result.errors || 0 });
        await loadStats();
      } else {
        console.error('Reindex failed:', result.error);
      }
    } catch (error) {
      console.error('Reindex error:', error);
    } finally {
      setIsReindexing(false);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* OpenRouter API Key */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Key size={16} />
          API Key de OpenRouter
        </h3>
        <p className="text-sm text-subtext0 mb-3">
          Configura tu API key de <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-lavender hover:underline">OpenRouter</a> para usar los modelos de IA.
        </p>
        
        {apiKeyInfo.hasKey && !showApiKeyInput ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-surface0 border border-surface1 rounded-lg px-3 py-2 text-sm text-subtext1 font-mono">
              {apiKeyInfo.maskedKey}
            </div>
            <button
              onClick={() => setShowApiKeyInput(true)}
              className="px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="flex-1 bg-surface0 border border-surface1 rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-lavender font-mono"
              />
              <button
                onClick={handleSaveApiKey}
                disabled={!newApiKey.trim() || savingApiKey}
                className="px-4 py-2 rounded-lg bg-lavender text-base hover:bg-mauve transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingApiKey ? 'Guardando...' : 'Guardar'}
              </button>
              {showApiKeyInput && apiKeyInfo.hasKey && (
                <button
                  onClick={() => {
                    setShowApiKeyInput(false);
                    setNewApiKey('');
                  }}
                  className="px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm"
                >
                  Cancelar
                </button>
              )}
            </div>
            <p className="text-xs text-subtext0">
              Tu API key se guarda localmente y nunca se comparte.
            </p>
          </div>
        )}
        
        {apiKeySaved && (
          <p className="text-xs text-green mt-2">
            ✅ API key guardada correctamente
          </p>
        )}
      </div>
      
      {/* API Status */}
      {modelsError && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3">
          <p className="text-sm text-red">{modelsError}</p>
          <p className="text-xs text-subtext0 mt-1">
            Asegúrate de tener configurada una API key válida de OpenRouter.
          </p>
        </div>
      )}
      
      {/* Chat Model Selection */}
      <div className="pt-4 border-t border-surface0">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Brain size={16} />
          Modelo de Chat IA
        </h3>
        <p className="text-sm text-subtext0 mb-3">
          Selecciona el modelo de lenguaje para el asistente de chat.
        </p>
        
        <div className="relative">
          <select
            value={chatModel}
            onChange={(e) => handleChatModelChange(e.target.value)}
            disabled={loadingModels || availableModels.chat.length === 0}
            className="w-full appearance-none bg-surface0 border border-surface1 rounded-lg px-3 py-2 pr-10 text-sm text-text focus:outline-none focus:border-lavender cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingModels ? (
              <option>Cargando modelos...</option>
            ) : availableModels.chat.length === 0 ? (
              <option>No hay modelos disponibles</option>
            ) : (
              <>
                {/* Show current model first if not in list */}
                {chatModel && !availableModels.chat.some(m => m.id === chatModel) && (
                  <option value={chatModel}>{chatModel} (actual)</option>
                )}
                {availableModels.chat.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({Math.round(model.contextLength / 1000)}k ctx)
                  </option>
                ))}
              </>
            )}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtext0 pointer-events-none" />
        </div>
        
        {chatModelChanged && (
          <p className="text-xs text-green mt-2">
            ✅ Modelo de chat actualizado
          </p>
        )}
      </div>
      
      {/* Embedding Model Selection */}
      <div className="pt-4 border-t border-surface0">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Database size={16} />
          Modelo de Embeddings
        </h3>
        <p className="text-sm text-subtext0 mb-3">
          Selecciona el modelo para generar embeddings de tus notas. Al cambiar de modelo debes re-indexar todas las notas.
        </p>
        
        <div className="relative">
          <select
            value={embeddingModel}
            onChange={(e) => handleEmbeddingModelChange(e.target.value)}
            disabled={loadingModels || availableModels.embedding.length === 0}
            className="w-full appearance-none bg-surface0 border border-surface1 rounded-lg px-3 py-2 pr-10 text-sm text-text focus:outline-none focus:border-lavender cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingModels ? (
              <option>Cargando modelos...</option>
            ) : availableModels.embedding.length === 0 ? (
              <option>No hay modelos disponibles</option>
            ) : (
              <>
                {/* Show current model first if not in list */}
                {embeddingModel && !availableModels.embedding.some(m => m.id === embeddingModel) && (
                  <option value={embeddingModel}>{embeddingModel} (actual)</option>
                )}
                {availableModels.embedding.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} - {model.pricing}
                  </option>
                ))}
              </>
            )}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtext0 pointer-events-none" />
        </div>
        
        {embeddingModelChanged && (
          <p className="text-xs text-yellow mt-2">
            ⚠️ Has cambiado el modelo. Re-indexa todas las notas para usar el nuevo modelo.
          </p>
        )}
      </div>
      
      {/* Semantic Search / Embeddings Stats */}
      <div className="pt-4 border-t border-surface0">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <RefreshCw size={16} />
          Indexación de Notas
        </h3>
        
        {/* Stats */}
        {stats && (
          <div className="bg-surface0 rounded-lg p-3 mb-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Database size={14} className="text-blue" />
              <span className="text-subtext1">Notas indexadas:</span>
              <span className="text-text font-medium">{stats.totalNotes}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-subtext1 ml-5">Chunks totales:</span>
              <span className="text-text font-medium">{stats.totalChunks}</span>
            </div>
            {stats.lastUpdated && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-subtext1 ml-5">Última actualización:</span>
                <span className="text-text font-medium">
                  {new Date(stats.lastUpdated).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}
        
        {/* Reindex button */}
        <button
          onClick={handleReindex}
          disabled={isReindexing}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${isReindexing 
              ? 'bg-surface1 text-subtext0 cursor-not-allowed' 
              : 'bg-lavender text-base hover:bg-mauve'
            }
          `}
        >
          <RefreshCw size={16} className={isReindexing ? 'animate-spin' : ''} />
          {isReindexing ? 'Re-indexando...' : 'Re-indexar todas las notas'}
        </button>
        
        {reindexResult && (
          <p className="text-sm text-green mt-2">
            ✅ Indexadas {reindexResult.indexed} notas
            {reindexResult.errors > 0 && (
              <span className="text-yellow"> ({reindexResult.errors} errores)</span>
            )}
          </p>
        )}
        
        <p className="text-xs text-subtext0 mt-3">
          Las notas se indexan automáticamente cuando se crean o modifican. 
          Usa este botón para re-indexar todas las notas existentes.
        </p>
      </div>
      
      {/* Refresh models button */}
      <div className="pt-4 border-t border-surface0">
        <button
          onClick={loadModels}
          disabled={loadingModels}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm disabled:opacity-50"
        >
          <RefreshCw size={14} className={loadingModels ? 'animate-spin' : ''} />
          Actualizar lista de modelos
        </button>
        <p className="text-xs text-subtext0 mt-2">
          Los modelos disponibles se obtienen de la API de OpenRouter.
        </p>
      </div>
    </div>
  );
}

/**
 * About tab
 */
function AboutTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-lavender flex items-center justify-center">
          <span className="text-base text-xl font-bold">N</span>
        </div>
        <div>
          <h2 className="text-lg font-bold">NotNative</h2>
          <p className="text-sm text-subtext0">v1.0.0</p>
        </div>
      </div>
      
      <p className="text-sm text-subtext1">
        Una aplicación de notas con editor Vim, AI integrado y soporte para bases de datos.
      </p>
      
      <div className="pt-4 border-t border-surface0 space-y-2">
        <p className="text-xs text-subtext0">
          Construido con Electron, React, CodeMirror y Tailwind CSS.
        </p>
        <p className="text-xs text-subtext0">
          Tema base: Catppuccin
        </p>
      </div>
    </div>
  );
}

/**
 * Settings Modal Component
 */
export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const { isSettingsOpen, setIsSettingsOpen } = useAppStore();
  
  // Sync with app store
  useEffect(() => {
    setIsOpen(isSettingsOpen);
  }, [isSettingsOpen]);
  
  // Register global handlers
  useEffect(() => {
    openSettingsModal = () => {
      setIsOpen(true);
      setIsSettingsOpen(true);
    };
    closeSettingsModal = () => {
      setIsOpen(false);
      setIsSettingsOpen(false);
    };
    
    return () => {
      openSettingsModal = null;
      closeSettingsModal = null;
    };
  }, [setIsSettingsOpen]);
  
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setIsSettingsOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsSettingsOpen]);
  
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsSettingsOpen(false);
  }, [setIsSettingsOpen]);
  
  if (!isOpen) return null;
  
  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'appearance', label: 'Apariencia', icon: Palette },
    { id: 'ai', label: 'IA & Búsqueda', icon: Brain },
    { id: 'editor', label: 'Editor', icon: Type },
    { id: 'about', label: 'Acerca de', icon: Info },
  ];
  
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="w-full max-w-2xl max-h-[80vh] bg-base rounded-xl shadow-2xl border border-surface0 flex flex-col animate-scale-in"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface0">
            <h2 className="text-lg font-semibold">Configuración</h2>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-surface0 transition-colors"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
          
          {/* Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar tabs */}
            <div className="w-40 flex-shrink-0 border-r border-surface0 p-2 space-y-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                    ${activeTab === id 
                      ? 'bg-lavender/20 text-lavender' 
                      : 'hover:bg-surface0 text-subtext1'
                    }
                  `}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            
            {/* Tab content */}
            <div className="flex-1 p-4 overflow-y-auto">
              {activeTab === 'appearance' && <AppearanceTab />}
              {activeTab === 'ai' && <AITab />}
              {activeTab === 'editor' && <EditorTab />}
              {activeTab === 'about' && <AboutTab />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
