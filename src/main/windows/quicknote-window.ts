import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let quickNoteWindow: BrowserWindow | null = null;

export async function createQuickNoteWindow(): Promise<BrowserWindow> {
  // If window already exists, focus it
  if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
    quickNoteWindow.focus();
    return quickNoteWindow;
  }

  // Get screen dimensions
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Window size
  const windowWidth = 400;
  const windowHeight = 300;

  // Position at bottom-right
  const x = screenWidth - windowWidth - 20;
  const y = screenHeight - windowHeight - 20;

  quickNoteWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    title: 'Quick Note',
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
    backgroundColor: '#1e1e2e',
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Show window when ready
  quickNoteWindow.once('ready-to-show', () => {
    quickNoteWindow?.show();
  });

  // Load the quicknote route
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    await quickNoteWindow.loadURL('http://localhost:5173/#/quicknote');
  } else {
    await quickNoteWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: '/quicknote',
    });
  }

  // Handle window close
  quickNoteWindow.on('closed', () => {
    quickNoteWindow = null;
  });

  // Handle blur - hide window
  quickNoteWindow.on('blur', () => {
    // Optionally hide on blur
    // quickNoteWindow?.hide();
  });

  return quickNoteWindow;
}

export function getQuickNoteWindow(): BrowserWindow | null {
  return quickNoteWindow;
}

export function closeQuickNoteWindow(): void {
  if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
    quickNoteWindow.close();
    quickNoteWindow = null;
  }
}

export function toggleQuickNoteWindow(): void {
  if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
    if (quickNoteWindow.isVisible()) {
      quickNoteWindow.hide();
    } else {
      quickNoteWindow.show();
      quickNoteWindow.focus();
    }
  } else {
    createQuickNoteWindow();
  }
}
