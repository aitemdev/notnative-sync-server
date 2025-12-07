import { Tray, Menu, app, nativeImage } from 'electron';
import { BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { toggleQuickNoteWindow } from '../windows/quicknote-window';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SystemTray {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.create();
  }

  private create(): void {
    // Create tray icon
    const iconPath = path.join(__dirname, '../../resources/icons/tray-icon.png');
    
    // Create a simple icon if the file doesn't exist
    let icon: Electron.NativeImage;
    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        // Create a simple 16x16 icon
        icon = nativeImage.createEmpty();
      }
    } catch {
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('NotNative');

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Mostrar NotNative',
        click: () => {
          this.showMainWindow();
        },
      },
      {
        label: 'Nota Rápida',
        click: () => {
          toggleQuickNoteWindow();
        },
      },
      { type: 'separator' },
      {
        label: 'Nueva Nota',
        click: () => {
          this.showMainWindow();
          // Send IPC to create new note
          this.mainWindow.webContents.send('tray:action', 'new-note');
        },
      },
      {
        label: 'Buscar...',
        click: () => {
          this.showMainWindow();
          // Send IPC to open search
          this.mainWindow.webContents.send('tray:action', 'search');
        },
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);

    // Click on tray icon
    this.tray.on('click', () => {
      this.toggleMainWindow();
    });

    // Double-click on tray icon
    this.tray.on('double-click', () => {
      this.showMainWindow();
    });
  }

  private showMainWindow(): void {
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  private toggleMainWindow(): void {
    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.showMainWindow();
    }
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
