import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sun, Moon, Monitor, Upload, Check, Palette, Type, Layout, Info, Brain, RefreshCw, Database, ChevronDown, Key, Globe, Folder, AlertTriangle, Paperclip, FileText } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useAppStore } from '../../stores/app-store';
import type { Theme, ThemeFile, ThemeColors } from '../../../shared/types/theme';
import { THEME_JSON_SCHEMA } from '../../../shared/types/theme';
import { changeLanguage, getCurrentLanguage } from '../../i18n';
import { HelpModal } from './HelpModal';

type SettingsTab = 'appearance' | 'ai' | 'editor' | 'language' | 'storage' | 'about';

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
  const { t } = useTranslation();
  
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
        <span className="text-sm font-medium text-text">{t('settings.appearance.system')}</span>
      </div>
      
      <p className="text-xs text-subtext0 mt-1">
        {t('settings.appearance.followSystem')}
      </p>
    </button>
  );
}

/**
 * Import theme from JSON file
 */
function ImportThemeButton({ onImport }: { onImport: (theme: Theme) => void }) {
  const { t } = useTranslation();
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
        {t('settings.appearance.importTheme')}
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
  const { t } = useTranslation();
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
          {t('settings.appearance.theme')}
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
          <h3 className="text-sm font-medium mb-3">{t('settings.appearance.customThemes')}</h3>
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
                  title={t('settings.appearance.deleteTheme')}
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
          {t('settings.appearance.importThemeDesc')}
        </p>
      </div>
      
      {/* Current theme colors preview */}
      <div className="pt-4 border-t border-surface0">
        <h3 className="text-sm font-medium mb-3">{t('settings.appearance.currentThemeColors')}</h3>
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
  const { t } = useTranslation();
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Type size={16} />
          {t('settings.editor.typography')}
        </h3>
        <p className="text-sm text-subtext0">
          {t('settings.editor.typographyDesc')}
        </p>
      </div>
      
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Layout size={16} />
          {t('settings.editor.layout')}
        </h3>
        <p className="text-sm text-subtext0">
          {t('settings.editor.layoutDesc')}
        </p>
      </div>
    </div>
  );
}

/**
 * Language settings tab
 */
function LanguageTab() {
  const { t, i18n } = useTranslation();
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());
  
  const handleLanguageChange = (lang: string) => {
    changeLanguage(lang);
    setCurrentLang(lang);
  };
  
  const languages = [
    { code: 'es', name: t('settings.language.spanish'), flag: '🇪🇸' },
    { code: 'en', name: t('settings.language.english'), flag: '🇬🇧' },
  ];
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Globe size={16} />
          {t('settings.language.title')}
        </h3>
        <p className="text-sm text-subtext0 mb-4">
          {t('settings.language.description')}
        </p>
        
        <div className="space-y-2">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`
                w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left
                ${currentLang === lang.code
                  ? 'border-lavender bg-lavender/10'
                  : 'border-surface1 hover:border-surface2 hover:bg-surface0'
                }
              `}
            >
              <span className="text-2xl">{lang.flag}</span>
              <span className="font-medium">{lang.name}</span>
              {currentLang === lang.code && (
                <Check size={16} className="ml-auto text-lavender" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Storage settings tab (notes directory)
 */
function StorageTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [pendingPath, setPendingPath] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    window.electron.app.getSettings()
      .then((settings) => {
        if (!mounted) return;
        const path = (settings as { notesRoot?: string }).notesRoot || '';
        setCurrentPath(path);
        setPendingPath(path);
      })
      .catch((err) => {
        console.error('Failed to load settings', err);
        setError(t('settings.storage.loadError', 'No se pudieron cargar los ajustes'));
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [t]);

  const handlePickFolder = async () => {
    setError(null);
    try {
      const picked = await window.electron.dialog.openDirectory();
      if (picked) {
        setPendingPath(picked);
      }
    } catch (err) {
      console.error('Folder pick failed', err);
      setError(t('settings.storage.pickError', 'No se pudo seleccionar la carpeta'));
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await window.electron.app.setSettings({ notesRoot: pendingPath || undefined });
      setCurrentPath(pendingPath);
    } catch (err) {
      console.error('Failed to save settings', err);
      setError(t('settings.storage.saveError', 'No se pudo guardar la carpeta'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg border border-surface0 bg-surface0/50">
        <AlertTriangle size={16} className="text-yellow mt-0.5" />
        <p className="text-sm text-subtext0">
          {t('settings.storage.warning', 'Las carpetas en red o nubes pueden ser lentas o inestables; úsalo bajo tu responsabilidad.')}
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Folder size={16} />
          {t('settings.storage.title', 'Carpeta de notas')}
        </h3>
        <p className="text-sm text-subtext0">
          {t('settings.storage.desc', 'Por defecto se usa una carpeta interna segura. Puedes elegir otra si lo necesitas.')}
        </p>

        {loading ? (
          <p className="text-sm text-subtext0">{t('common.loading', 'Cargando...')}</p>
        ) : (
          <div className="space-y-2">
            <div className="px-3 py-2 rounded-lg border border-surface1 bg-surface0 text-sm text-text flex items-center justify-between gap-2">
              <span className="truncate" title={pendingPath || t('settings.storage.defaultPath', 'Ruta por defecto')}>
                {pendingPath || t('settings.storage.defaultPath', 'Ruta por defecto')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const pathToOpen = pendingPath || await window.electron.files.getNotesDirectory();
                    await window.electron.shell.showItemInFolder(pathToOpen);
                  }}
                  className="p-1.5 rounded-md bg-surface1 hover:bg-surface2 text-subtext0 hover:text-text transition-colors"
                  title="Abrir carpeta"
                >
                  <Folder size={16} />
                </button>
                <button
                  onClick={handlePickFolder}
                  className="px-3 py-1 rounded-md bg-surface1 hover:bg-surface2 text-sm"
                >
                  {t('settings.storage.change', 'Cambiar')}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="px-3 py-2 rounded-md bg-lavender text-base hover:bg-lavender/90 disabled:opacity-60"
              >
                {saving ? t('common.saving', 'Guardando...') : t('common.save', 'Guardar')}
              </button>
              {currentPath && pendingPath !== currentPath && (
                <span className="text-xs text-subtext0">
                  {t('settings.storage.restartHint', 'Reinicia para reindexar la nueva carpeta si cambias la ruta.')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}

/**
 * Attachments stats section
 */
function AttachmentsStatsSection() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{ totalAttachments: number; totalSize: number; orphanedCount: number } | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ cleaned: number } | null>(null);

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const result = await window.electron.attachments.getStats();
      if (result.success && result.totalAttachments !== undefined && result.totalSize !== undefined && result.orphanedCount !== undefined) {
        setStats({
          totalAttachments: result.totalAttachments,
          totalSize: result.totalSize,
          orphanedCount: result.orphanedCount,
        });
      }
    } catch (error) {
      console.error('Failed to load attachment stats:', error);
    }
  };

  const handleCleanOrphans = async () => {
    setIsCleaning(true);
    setCleanResult(null);
    
    try {
      const result = await window.electron.attachments.cleanOrphans();
      if (result.success && result.cleaned !== undefined) {
        setCleanResult({ cleaned: result.cleaned });
        // Reload stats after cleaning
        await loadStats();
      }
    } catch (error) {
      console.error('Failed to clean orphaned attachments:', error);
    } finally {
      setIsCleaning(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  return (
    <div className="pt-4 border-t border-surface0">
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
        <Paperclip size={16} />
        Attachments
      </h3>
      
      {/* Stats */}
      {stats && (
        <div className="bg-surface0 rounded-lg p-3 mb-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <FileText size={14} className="text-blue" />
            <span className="text-subtext1">Total attachments:</span>
            <span className="text-text font-medium">{stats.totalAttachments}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-subtext1 ml-5">Space used:</span>
            <span className="text-text font-medium">{formatSize(stats.totalSize)}</span>
          </div>
          {stats.orphanedCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle size={14} className="text-yellow" />
              <span className="text-subtext1">Orphaned files:</span>
              <span className="text-yellow font-medium">{stats.orphanedCount}</span>
            </div>
          )}
        </div>
      )}
      
      {/* Clean orphans button */}
      {stats && stats.orphanedCount > 0 && (
        <>
          <button
            onClick={handleCleanOrphans}
            disabled={isCleaning}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${isCleaning 
                ? 'bg-surface1 text-subtext0 cursor-not-allowed' 
                : 'bg-yellow text-base hover:bg-peach'
              }
            `}
          >
            <AlertTriangle size={16} />
            {isCleaning ? 'Cleaning...' : 'Clean Orphaned Attachments'}
          </button>
          
          {cleanResult && (
            <p className="text-sm text-green mt-2">
              ✅ Cleaned {cleanResult.cleaned} orphaned attachment{cleanResult.cleaned !== 1 ? 's' : ''}
            </p>
          )}
        </>
      )}
      
      <p className="text-xs text-subtext0 mt-3">
        Attachments are files stored in .assets folders next to your notes. Orphaned files are database entries for files that no longer exist on disk.
      </p>
    </div>
  );
}

/**
 * AI & Search settings tab
 */
function AITab() {
  const { t } = useTranslation();
  const [isReindexing, setIsReindexing] = useState(false);
  const [stats, setStats] = useState<{ totalNotes: number; totalChunks: number; lastUpdated: Date | null } | null>(null);
  const [reindexResult, setReindexResult] = useState<{ indexed: number; errors: number } | null>(null);
  
  // API Key states
  const [apiKeyInfo, setApiKeyInfo] = useState<{ hasKey: boolean; maskedKey: string }>({ hasKey: false, maskedKey: '' });
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);

  // Brave key states
  const [braveKeyInfo, setBraveKeyInfo] = useState<{ hasKey: boolean; maskedKey: string }>({ hasKey: false, maskedKey: '' });
  const [newBraveKey, setNewBraveKey] = useState('');
  const [showBraveKeyInput, setShowBraveKeyInput] = useState(false);
  const [savingBraveKey, setSavingBraveKey] = useState(false);
  const [braveKeySaved, setBraveKeySaved] = useState(false);
  
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
    loadBraveKeyInfo();
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

  const loadBraveKeyInfo = async () => {
    try {
      const info = await window.electron.ai.getBraveApiKey();
      setBraveKeyInfo(info);
    } catch (error) {
      console.error('Failed to load Brave API key info:', error);
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

  const handleSaveBraveKey = async () => {
    if (!newBraveKey.trim()) return;
    setSavingBraveKey(true);
    try {
      const result = await window.electron.ai.setBraveApiKey(newBraveKey.trim());
      if (result.success) {
        setBraveKeySaved(true);
        setNewBraveKey('');
        setShowBraveKeyInput(false);
        await loadBraveKeyInfo();
        setTimeout(() => setBraveKeySaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save Brave API key:', error);
    } finally {
      setSavingBraveKey(false);
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
      setModelsError(t('settings.ai.loadingModelsError'));
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
          {t('settings.ai.apiKey')}
        </h3>
        <p className="text-sm text-subtext0 mb-3">
          {t('settings.ai.apiKeyDesc')} <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-lavender hover:underline">OpenRouter</a>
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
              {t('common.change')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder={t('settings.ai.apiKeyPlaceholder')}
                className="flex-1 bg-surface0 border border-surface1 rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-lavender font-mono"
              />
              <button
                onClick={handleSaveApiKey}
                disabled={!newApiKey.trim() || savingApiKey}
                className="px-4 py-2 rounded-lg bg-lavender text-base hover:bg-mauve transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingApiKey ? t('settings.ai.saving') : t('common.save')}
              </button>
              {showApiKeyInput && apiKeyInfo.hasKey && (
                <button
                  onClick={() => {
                    setShowApiKeyInput(false);
                    setNewApiKey('');
                  }}
                  className="px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm"
                >
                  {t('common.cancel')}
                </button>
              )}
            </div>
            <p className="text-xs text-subtext0">
              {t('settings.ai.apiKeyLocal')}
            </p>
          </div>
        )}
        
        {apiKeySaved && (
          <p className="text-xs text-green mt-2">
            ✅ {t('settings.ai.apiKeySaved')}
          </p>
        )}
      </div>

      {/* Brave Search API Key */}
      <div className="pt-4 border-t border-surface0">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Globe size={16} />
          {t('settings.ai.braveKey')}
        </h3>
        <p className="text-sm text-subtext0 mb-3">
          {t('settings.ai.braveKeyDesc')}
        </p>

        {braveKeyInfo.hasKey && !showBraveKeyInput ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-surface0 border border-surface1 rounded-lg px-3 py-2 text-sm text-subtext1 font-mono">
              {braveKeyInfo.maskedKey}
            </div>
            <button
              onClick={() => {
                setShowBraveKeyInput(true);
                setNewBraveKey('');
              }}
              className="px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm"
            >
              {t('common.change')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={newBraveKey}
                onChange={(e) => setNewBraveKey(e.target.value)}
                placeholder={t('settings.ai.braveKeyPlaceholder')}
                className="flex-1 bg-surface0 border border-surface1 rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-lavender font-mono"
              />
              <button
                onClick={handleSaveBraveKey}
                disabled={!newBraveKey.trim() || savingBraveKey}
                className="px-4 py-2 rounded-lg bg-lavender text-base hover:bg-mauve transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingBraveKey ? t('settings.ai.saving') : t('common.save')}
              </button>
              {braveKeyInfo.hasKey && (
                <button
                  onClick={() => {
                    setShowBraveKeyInput(false);
                    setNewBraveKey('');
                  }}
                  className="px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm"
                >
                  {t('common.cancel')}
                </button>
              )}
            </div>
            <p className="text-xs text-subtext0">{t('settings.ai.braveKeyLocal')}</p>
          </div>
        )}

        {braveKeySaved && (
          <p className="text-xs text-green mt-2">
            ✅ {t('settings.ai.apiKeySaved')}
          </p>
        )}
      </div>
      
      {/* API Status */}
      {modelsError && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3">
          <p className="text-sm text-red">{modelsError}</p>
          <p className="text-xs text-subtext0 mt-1">
            {t('settings.ai.apiKeyError')}
          </p>
        </div>
      )}
      
      {/* Chat Model Selection */}
      <div className="pt-4 border-t border-surface0">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Brain size={16} />
          {t('settings.ai.chatModel')}
        </h3>
        <p className="text-sm text-subtext0 mb-3">
          {t('settings.ai.chatModelDesc')}
        </p>
        
        <div className="relative">
          <select
            value={chatModel}
            onChange={(e) => handleChatModelChange(e.target.value)}
            disabled={loadingModels || availableModels.chat.length === 0}
            className="w-full appearance-none bg-surface0 border border-surface1 rounded-lg px-3 py-2 pr-10 text-sm text-text focus:outline-none focus:border-lavender cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingModels ? (
              <option>{t('settings.ai.loadingModels')}</option>
            ) : availableModels.chat.length === 0 ? (
              <option>{t('settings.ai.noModelsAvailable')}</option>
            ) : (
              <>
                {/* Show current model first if not in list */}
                {chatModel && !availableModels.chat.some(m => m.id === chatModel) && (
                  <option value={chatModel}>{chatModel} ({t('settings.ai.current')})</option>
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
            ✅ {t('settings.ai.chatModelUpdated')}
          </p>
        )}
      </div>
      
      {/* Embedding Model Selection */}
      <div className="pt-4 border-t border-surface0">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Database size={16} />
          {t('settings.ai.embeddingModel')}
        </h3>
        <p className="text-sm text-subtext0 mb-3">
          {t('settings.ai.embeddingModelDesc')}
        </p>
        
        <div className="relative">
          <select
            value={embeddingModel}
            onChange={(e) => handleEmbeddingModelChange(e.target.value)}
            disabled={loadingModels || availableModels.embedding.length === 0}
            className="w-full appearance-none bg-surface0 border border-surface1 rounded-lg px-3 py-2 pr-10 text-sm text-text focus:outline-none focus:border-lavender cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingModels ? (
              <option>{t('settings.ai.loadingModels')}</option>
            ) : availableModels.embedding.length === 0 ? (
              <option>{t('settings.ai.noModelsAvailable')}</option>
            ) : (
              <>
                {/* Show current model first if not in list */}
                {embeddingModel && !availableModels.embedding.some(m => m.id === embeddingModel) && (
                  <option value={embeddingModel}>{embeddingModel} ({t('settings.ai.current')})</option>
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
            ⚠️ {t('settings.ai.embeddingModelWarning')}
          </p>
        )}
      </div>
      
      {/* Semantic Search / Embeddings Stats */}
      <div className="pt-4 border-t border-surface0">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <RefreshCw size={16} />
          {t('settings.ai.indexing')}
        </h3>
        
        {/* Stats */}
        {stats && (
          <div className="bg-surface0 rounded-lg p-3 mb-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Database size={14} className="text-blue" />
              <span className="text-subtext1">{t('settings.ai.indexedNotes')}:</span>
              <span className="text-text font-medium">{stats.totalNotes}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-subtext1 ml-5">{t('settings.ai.totalChunks')}:</span>
              <span className="text-text font-medium">{stats.totalChunks}</span>
            </div>
            {stats.lastUpdated && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-subtext1 ml-5">{t('settings.ai.lastUpdated')}:</span>
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
          {isReindexing ? t('settings.ai.reindexing') : t('settings.ai.reindex')}
        </button>
        
        {reindexResult && (
          <p className="text-sm text-green mt-2">
            ✅ {t('settings.ai.reindexSuccess', { count: reindexResult.indexed })}
            {reindexResult.errors > 0 && (
              <span className="text-yellow"> ({t('settings.ai.reindexErrors', { count: reindexResult.errors })})</span>
            )}
          </p>
        )}
        
        <p className="text-xs text-subtext0 mt-3">
          {t('settings.ai.indexingHelp')}
        </p>
      </div>

      {/* Attachments Stats */}
      <AttachmentsStatsSection />
      
      {/* Refresh models button */}
      <div className="pt-4 border-t border-surface0">
        <button
          onClick={loadModels}
          disabled={loadingModels}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm disabled:opacity-50"
        >
          <RefreshCw size={14} className={loadingModels ? 'animate-spin' : ''} />
          {t('settings.ai.refreshModels')}
        </button>
        <p className="text-xs text-subtext0 mt-2">
          {t('settings.ai.refreshModelsDesc')}
        </p>
      </div>
    </div>
  );
}

/**
 * About tab
 */
function AboutTab() {
  const { t } = useTranslation();
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [helpSection, setHelpSection] = useState<'keybindings' | 'vim'>('keybindings');

  const openHelp = (section: 'keybindings' | 'vim') => {
    setHelpSection(section);
    setHelpModalOpen(true);
  };
  
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
        {t('settings.about.description')}
      </p>
      
      <div className="pt-4 border-t border-surface0 space-y-2">
        <p className="text-xs text-subtext0">
          {t('settings.about.builtWith')}
        </p>
        <p className="text-xs text-subtext0">
          {t('settings.about.baseTheme')}
        </p>
      </div>

      <div className="pt-4 border-t border-surface0 space-y-2">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Key size={16} />
          <span>Help / Ayuda</span>
        </h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => openHelp('keybindings')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm"
          >
            <Key size={14} />
            <span>Keybindings (EN/ES)</span>
          </button>
          <button
            onClick={() => openHelp('vim')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface1 hover:border-surface2 hover:bg-surface0 transition-colors text-sm"
          >
            <Key size={14} />
            <span>Vim Editor Cheatsheet (EN/ES)</span>
          </button>
        </div>
        <p className="text-xs text-subtext0">
          Opens the help modal with keyboard shortcuts and Vim commands. // Abre el modal de ayuda con atajos y comandos Vim.
        </p>
      </div>

      <HelpModal 
        isOpen={helpModalOpen} 
        onClose={() => setHelpModalOpen(false)}
        defaultSection={helpSection}
      />
    </div>
  );
}

/**
 * Settings Modal Component
 */
export function SettingsModal() {
  const { t } = useTranslation();
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
    { id: 'appearance', label: t('settings.tabs.appearance'), icon: Palette },
    { id: 'ai', label: t('settings.tabs.ai'), icon: Brain },
    { id: 'editor', label: t('settings.tabs.editor'), icon: Type },
    { id: 'language', label: t('settings.tabs.language'), icon: Globe },
      { id: 'storage', label: t('settings.tabs.storage'), icon: Folder },
    { id: 'about', label: t('settings.tabs.about'), icon: Info },
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
            <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-surface0 transition-colors"
              aria-label={t('common.close')}
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
              {activeTab === 'language' && <LanguageTab />}
                {activeTab === 'storage' && <StorageTab />}
              {activeTab === 'about' && <AboutTab />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
