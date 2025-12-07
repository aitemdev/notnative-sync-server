import { app, BrowserWindow, shell, nativeTheme, globalShortcut } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { initDatabase, getDatabase, closeDatabase } from './database/connection';
import { registerIpcHandlers } from './ipc/handlers';
import { registerAIHandlers } from './ipc/ai-handlers';
import { createMainWindow, getMainWindow } from './windows/main-window';
import { createQuickNoteWindow } from './windows/quicknote-window';
import { NotesDirectory } from './files/notes-directory';
import { NotesWatcher } from './files/watcher';
import { MCPServer } from './mcp/server';
import { SystemTray } from './tray/system-tray';

// Load environment variables from .env file
config();

// Disable GPU acceleration to avoid GPU process errors on some systems
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Handle EPIPE errors gracefully (occurs when stdout/stderr is closed)
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
});
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Global references
let notesDir: NotesDirectory | null = null;
let watcher: NotesWatcher | null = null;
let mcpServer: MCPServer | null = null;
let tray: SystemTray | null = null;

// Environment
const isDev = process.env.NODE_ENV === 'development';
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

async function initialize() {
  // Set app name
  app.setName('NotNative');

  // Initialize database
  const userDataPath = app.getPath('userData');
  await initDatabase(userDataPath);

  // Initialize notes directory
  const documentsPath = app.getPath('documents');
  const notesPath = path.join(documentsPath, 'NotNative Notes');
  notesDir = new NotesDirectory(notesPath);
  await notesDir.ensureStructure();

  // Create main window
  const mainWindow = await createMainWindow();

  // Register IPC handlers
  registerIpcHandlers(getDatabase()!, notesDir);
  registerAIHandlers(getDatabase()!, notesDir, getMainWindow);

  // Start file watcher (includes initial sync)
  watcher = new NotesWatcher(getDatabase()!, notesDir, mainWindow);
  await watcher.start();

  // Start MCP server
  mcpServer = new MCPServer(getDatabase()!, notesDir);
  mcpServer.start();

  // Create system tray
  tray = new SystemTray(mainWindow);

  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools();

  // Register global shortcuts
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });
}

// Cleanup function
function cleanup() {
  console.log('🧹 Cleaning up...');
  watcher?.stop();
  mcpServer?.stop();
  closeDatabase();
  globalShortcut.unregisterAll();
}

// Handle app ready
app.whenReady().then(initialize);

// Handle all windows closed
app.on('window-all-closed', () => {
  // On macOS, keep the app running even with no windows
  if (!isMac) {
    app.quit();
  }
});

// Handle activate (macOS)
app.on('activate', async () => {
  // Re-create window on macOS when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

// Handle before quit - notify renderer to save
app.on('before-quit', async (event) => {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Send signal to renderer to save
    mainWindow.webContents.send('app:before-quit');
    // Give renderer a moment to save (100ms should be enough for sync save)
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  cleanup();
});

// Handle quit
app.on('quit', () => {
  console.log('👋 App quit');
});

// Handle will-quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Handle SIGINT and SIGTERM (Ctrl+C in terminal)
process.on('SIGINT', () => {
  console.log('🛑 SIGINT received');
  cleanup();
  app.quit();
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received');
  cleanup();
  app.quit();
});

// Handle second instance (single instance lock)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Only allow navigation to app URLs in development
    if (isDev && parsedUrl.hostname === 'localhost') {
      return;
    }
    
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});

// Handle certificate errors (development only)
if (isDev) {
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
  });
}

// Export for use in other modules
export { notesDir, getMainWindow };
