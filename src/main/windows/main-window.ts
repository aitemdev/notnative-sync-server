import { BrowserWindow, screen, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

/**
 * Wait for the dev server to be ready
 */
async function waitForDevServer(url: string, maxRetries = 50, delayMs = 300): Promise<void> {
  console.log('⏳ Waiting for dev server at', url);
  // Initial delay to let Vite start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const request = http.get(url, (res) => {
          // Accept any 2xx or 3xx status code
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            resolve();
          } else {
            reject(new Error(`Server returned ${res.statusCode}`));
          }
        });
        request.on('error', (err) => {
          reject(err);
        });
        request.setTimeout(1000, () => {
          request.destroy();
          reject(new Error('Request timeout'));
        });
      });
      console.log('✅ Dev server is ready');
      return;
    } catch (error) {
      if (i === maxRetries - 1) {
        console.error('❌ Dev server not ready after', maxRetries, 'attempts. Last error:', error);
        throw new Error(`Dev server not ready after ${maxRetries} attempts: ${error}`);
      }
      if (i % 5 === 0 && i > 0) {
        console.log(`⏳ Still waiting for dev server... (attempt ${i + 1}/${maxRetries})`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export async function createMainWindow(): Promise<BrowserWindow> {
  // Get screen dimensions
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Calculate window size (80% of screen)
  const windowWidth = Math.floor(screenWidth * 0.8);
  const windowHeight = Math.floor(screenHeight * 0.8);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 800,
    minHeight: 600,
    title: 'NotNative',
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
    backgroundColor: '#1e1e2e', // Catppuccin Mocha base
    show: false,
    frame: true,
    autoHideMenuBar: true, // Hide menu bar (press Alt to show)
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for better-sqlite3
      webSecurity: true,
      spellcheck: true,
      zoomFactor: 1.0, // Reset zoom to default
    },
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    const devUrl = 'http://localhost:5173';
    console.log('⏳ Waiting for dev server...');
    await waitForDevServer(devUrl);
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    // Block note:// URLs from opening new windows (handled in renderer)
    if (url.startsWith('note://')) {
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function focusMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
}

export function toggleMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  }
}
