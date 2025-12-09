import { ipcMain, BrowserWindow } from 'electron';
import type { SyncService } from '../sync/sync-service';

export function registerSyncHandlers(syncService: SyncService, mainWindow: BrowserWindow): void {
  syncService.setMainWindow(mainWindow);

  // ============== AUTHENTICATION ==============

  ipcMain.handle('sync:login', async (_, email: string, password: string, serverUrl: string) => {
    try {
      const result = await syncService.login(email, password, serverUrl);
      if (result.success) {
        // Notify renderer that auth succeeded
        mainWindow.webContents.send('sync:auth-success');
      }
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('sync:register', async (_, email: string, password: string, serverUrl: string) => {
    try {
      const result = await syncService.register(email, password, serverUrl);
      if (result.success) {
        // Notify renderer that auth succeeded
        mainWindow.webContents.send('sync:auth-success');
      }
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('sync:logout', async () => {
    try {
      await syncService.logout();
      // Notify renderer that user logged out
      mainWindow.webContents.send('sync:auth-success');
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ============== SYNC OPERATIONS ==============

  ipcMain.handle('sync:manual', async () => {
    try {
      const result = await syncService.manualSync();
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('sync:status', async () => {
    try {
      const status = syncService.getStatus();
      return { success: true, status };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('sync:get-config', async () => {
    try {
      const config = syncService.getConfig();
      return { success: true, config };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ============== PERIODIC SYNC CONTROL ==============

  ipcMain.handle('sync:start-periodic', async () => {
    try {
      syncService.startPeriodicSync();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('sync:stop-periodic', async () => {
    try {
      syncService.stopPeriodicSync();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Cleanup on window close
  mainWindow.on('closed', () => {
    syncService.dispose();
  });
}
