import { app, BrowserWindow, shell, nativeTheme, globalShortcut, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
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
import { loadSettings } from './settings/store';

// Load environment variables from .env file
config();

// ============== SINGLE INSTANCE LOCK ==============
// Handle this FIRST before any other initialization to exit quickly if second instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit immediately
  app.quit();
  process.exit(0);
}

// Handle second instance - show the existing window
app.on('second-instance', () => {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    // Show window if it's hidden or minimized
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

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

// Register custom protocol scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Global references
let notesDir: NotesDirectory | null = null;
let watcher: NotesWatcher | null = null;
let mcpServer: MCPServer | null = null;
let tray: SystemTray | null = null;
let isQuitting = false;

// Environment
const isDev = process.env.NODE_ENV === 'development';
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    case '.bmp': return 'image/bmp';
    default: return 'application/octet-stream';
  }
}

async function initialize() {
  // Set app name
  app.setName('NotNative');

  // Register custom protocol to serve local files (needed for images in notes)
  protocol.handle('local-file', async (request) => {
    try {
      console.log('📁 Protocol request URL:', request.url);
      
      // Extract the path from the URL
      // local-file:///home/... -> /home/...
      // local-file://home/... -> /home/... (browser might normalize)
      let filePath: string;
      
      if (request.url.startsWith('local-file:///')) {
        // Standard format with triple slash for absolute paths
        filePath = decodeURIComponent(request.url.slice('local-file://'.length));
      } else if (request.url.startsWith('local-file://')) {
        // Browser normalized format - add leading slash for absolute path
        const pathPart = request.url.slice('local-file://'.length);
        filePath = '/' + decodeURIComponent(pathPart);
      } else {
        throw new Error(`Invalid local-file URL format: ${request.url}`);
      }
      
      const normalizedPath = path.normalize(filePath);
      
      console.log('📁 Resolved file path:', normalizedPath);
      
      // Check if file exists and is readable
      await fs.promises.access(normalizedPath, fs.constants.R_OK);
      
      const data = await fs.promises.readFile(normalizedPath);
      const mimeType = getMimeType(normalizedPath);
      
      console.log('📁 Serving file:', normalizedPath, 'MIME:', mimeType, 'Size:', data.length);
      
      return new Response(data, {
        headers: { 'Content-Type': mimeType }
      });
    } catch (error) {
      console.error('📁 Error handling local-file request:', request.url, error);
      return new Response('Not found', { status: 404 });
    }
  });

  // Initialize database
  const userDataPath = app.getPath('userData');
  await initDatabase(userDataPath);

  // Initialize notes directory
  const settings = loadSettings();
  const documentsPath = app.getPath('documents');
  const defaultNotesPath = path.join(documentsPath, 'NotNative Notes');
  const notesPath = settings.notesRoot || defaultNotesPath;
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

  // Ensure window is shown after everything is initialized
  mainWindow.show();
  mainWindow.focus();

  // Open DevTools only in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

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
  if (app.isReady()) {
    globalShortcut.unregisterAll();
  }
}

// Handle app ready
app.whenReady().then(initialize);

// Handle all windows closed - don't quit, keep running in tray
app.on('window-all-closed', () => {
  // On Linux and Windows, keep the app running in the tray
  // Only quit on macOS if explicitly requested
  if (isMac) {
    // On macOS, do nothing - app keeps running
  }
  // On other platforms, don't quit - stay in tray
});

// Handle activate (macOS)
app.on('activate', async () => {
  // Re-create or show window on macOS when dock icon is clicked
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

// Handle before quit - notify renderer to save
app.on('before-quit', async (event) => {
  isQuitting = true;
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
  if (app.isReady()) {
    globalShortcut.unregisterAll();
  }
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
export function getIsQuitting(): boolean {
  return isQuitting;
}
