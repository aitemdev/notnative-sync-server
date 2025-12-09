/**
 * Settings Store
 * Persists app settings to a JSON file
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface AppSettings {
  openrouterApiKey?: string;
  chatModel?: string;
  embeddingModel?: string;
  braveApiKey?: string;
  notesRoot?: string;
  zoomLevel?: number;
}

const SETTINGS_FILE = 'settings.json';

let settingsPath: string | null = null;
let cachedSettings: AppSettings | null = null;

function getSettingsPath(): string {
  if (!settingsPath) {
    settingsPath = path.join(app.getPath('userData'), SETTINGS_FILE);
  }
  return settingsPath;
}

export function loadSettings(): AppSettings {
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      cachedSettings = JSON.parse(data) as AppSettings;
      return cachedSettings;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  cachedSettings = {};
  return cachedSettings;
}

export function getSettings(): AppSettings {
  return loadSettings();
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const merged = { ...loadSettings(), ...partial };
  saveSettings(merged);
  return merged;
}

export function saveSettings(settings: AppSettings): void {
  try {
    const filePath = getSettingsPath();
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    cachedSettings = settings;
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const settings = loadSettings();
  return settings[key];
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
}

export function getApiKey(): string {
  // Priority: saved setting > environment variable
  const saved = getSetting('openrouterApiKey');
  if (saved) return saved;
  return process.env.OPENROUTER_API_KEY || '';
}

export function setApiKey(apiKey: string): void {
  setSetting('openrouterApiKey', apiKey);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

export function getBraveApiKey(): string {
  const saved = getSetting('braveApiKey');
  if (saved) return saved;
  return process.env.BRAVE_API_KEY || '';
}

export function setBraveApiKey(apiKey: string): void {
  setSetting('braveApiKey', apiKey);
}

export function hasBraveApiKey(): boolean {
  return !!getBraveApiKey();
}
