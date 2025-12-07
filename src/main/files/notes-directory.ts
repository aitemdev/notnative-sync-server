import fs from 'fs';
import path from 'path';
import { NOTE_EXTENSIONS } from '../../shared/constants';

/**
 * NotesDirectory manages the root directory for all notes.
 * It handles the folder structure including special folders like .trash and .history.
 */
export class NotesDirectory {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Ensure the base directory structure exists
   */
  async ensureStructure(): Promise<void> {
    await fs.promises.mkdir(this.rootPath, { recursive: true });
    await fs.promises.mkdir(this.trashPath, { recursive: true });
    await fs.promises.mkdir(this.historyPath, { recursive: true });
  }

  /**
   * Get the root path
   */
  get root(): string {
    return this.rootPath;
  }

  /**
   * Get the trash folder path
   */
  get trashPath(): string {
    return path.join(this.rootPath, '.trash');
  }

  /**
   * Get the history folder path
   */
  get historyPath(): string {
    return path.join(this.rootPath, '.history');
  }

  /**
   * Resolve a relative path to an absolute path
   */
  resolve(relativePath: string): string {
    return path.join(this.rootPath, relativePath);
  }

  /**
   * Get the relative path from an absolute path
   */
  relative(absolutePath: string): string {
    return path.relative(this.rootPath, absolutePath);
  }

  /**
   * Check if a path is inside the notes directory
   */
  isInsideNotesDir(absolutePath: string): boolean {
    const relative = path.relative(this.rootPath, absolutePath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  /**
   * Check if a path is a hidden folder (starts with .)
   */
  isHiddenPath(relativePath: string): boolean {
    return relativePath.split(path.sep).some(part => part.startsWith('.'));
  }

  /**
   * Check if a file is a note file (has valid extension)
   */
  isNoteFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return NOTE_EXTENSIONS.includes(ext);
  }

  /**
   * List all note files recursively
   */
  async listAllNotes(): Promise<string[]> {
    const notes: string[] = [];
    await this.scanDirectory(this.rootPath, notes);
    return notes;
  }

  /**
   * Recursively scan a directory for note files
   */
  private async scanDirectory(dir: string, notes: string[]): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip hidden files and folders
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, notes);
      } else if (this.isNoteFile(entry.name)) {
        notes.push(fullPath);
      }
    }
  }

  /**
   * List all folders (non-recursive)
   */
  async listFolders(parentFolder?: string): Promise<string[]> {
    const targetDir = parentFolder 
      ? path.join(this.rootPath, parentFolder)
      : this.rootPath;

    const folders: string[] = [];
    const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden folders
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        const relativePath = parentFolder
          ? path.join(parentFolder, entry.name)
          : entry.name;
        folders.push(relativePath);
      }
    }

    return folders;
  }

  /**
   * List all folders recursively
   */
  async listAllFolders(): Promise<string[]> {
    const folders: string[] = [];
    await this.scanFolders(this.rootPath, '', folders);
    return folders;
  }

  private async scanFolders(dir: string, prefix: string, folders: string[]): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden folders
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
        folders.push(relativePath);
        await this.scanFolders(path.join(dir, entry.name), relativePath, folders);
      }
    }
  }

  /**
   * Create a folder
   */
  async createFolder(folderPath: string): Promise<void> {
    const absolutePath = this.resolve(folderPath);
    await fs.promises.mkdir(absolutePath, { recursive: true });
  }

  /**
   * Delete a folder (must be empty or use recursive)
   */
  async deleteFolder(folderPath: string, recursive = false): Promise<void> {
    const absolutePath = this.resolve(folderPath);
    
    if (recursive) {
      await fs.promises.rm(absolutePath, { recursive: true, force: true });
    } else {
      await fs.promises.rmdir(absolutePath);
    }
  }

  /**
   * Rename a folder
   */
  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    const absoluteOld = this.resolve(oldPath);
    const absoluteNew = this.resolve(newPath);
    
    // Create parent directories if needed
    await fs.promises.mkdir(path.dirname(absoluteNew), { recursive: true });
    
    await fs.promises.rename(absoluteOld, absoluteNew);
  }

  /**
   * Check if a path exists
   */
  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the folder for a note path
   */
  getFolderFromPath(notePath: string): string | null {
    const relative = this.relative(notePath);
    const dir = path.dirname(relative);
    return dir === '.' ? null : dir;
  }

  /**
   * Get the note name (without extension) from a path
   */
  getNoteNameFromPath(notePath: string): string {
    return path.basename(notePath, path.extname(notePath));
  }
}
