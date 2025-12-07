import fs from 'fs';
import path from 'path';
import { NotesDirectory } from './notes-directory';

/**
 * NoteFile handles operations on individual note files.
 */
export class NoteFile {
  private filePath: string;
  readonly name: string;

  private constructor(filePath: string, name: string) {
    this.filePath = filePath;
    this.name = name;
  }

  /**
   * Open an existing note file
   */
  static open(filePath: string): NoteFile {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (!filePath.endsWith('.md')) {
      throw new Error('File must have .md extension');
    }

    const name = path.basename(filePath, '.md');
    return new NoteFile(filePath, name);
  }

  /**
   * Create a new note file
   */
  static create(filePath: string, initialContent: string = ''): NoteFile {
    // Ensure file has .md extension
    if (!filePath.endsWith('.md')) {
      filePath = `${filePath}.md`;
    }

    // Create parent directories if needed
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // Write initial content
    fs.writeFileSync(filePath, initialContent, 'utf-8');

    return NoteFile.open(filePath);
  }

  /**
   * Check if a note file exists
   */
  static exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * Generate a default content for a new note
   */
  static generateDefaultContent(title: string): string {
    const date = new Date().toISOString().split('T')[0];
    return `---
tags: []
date: ${date}
---

# ${title}

`;
  }

  /**
   * Get the absolute file path
   */
  get path(): string {
    return this.filePath;
  }

  /**
   * Get the directory containing this note
   */
  get directory(): string {
    return path.dirname(this.filePath);
  }

  /**
   * Read the note content
   */
  read(): string {
    return fs.readFileSync(this.filePath, 'utf-8');
  }

  /**
   * Read the note content asynchronously
   */
  async readAsync(): Promise<string> {
    return fs.promises.readFile(this.filePath, 'utf-8');
  }

  /**
   * Write content to the note
   */
  write(content: string): void {
    fs.writeFileSync(this.filePath, content, 'utf-8');
  }

  /**
   * Write content asynchronously
   */
  async writeAsync(content: string): Promise<void> {
    await fs.promises.writeFile(this.filePath, content, 'utf-8');
  }

  /**
   * Append content to the note
   */
  append(content: string): void {
    fs.appendFileSync(this.filePath, content, 'utf-8');
  }

  /**
   * Get file stats
   */
  getStats(): fs.Stats {
    return fs.statSync(this.filePath);
  }

  /**
   * Get file stats asynchronously
   */
  async getStatsAsync(): Promise<fs.Stats> {
    return fs.promises.stat(this.filePath);
  }

  /**
   * Move the note to trash
   */
  trash(notesDir: NotesDirectory): string {
    const timestamp = Date.now();
    const trashName = `${this.name}_${timestamp}.md`;
    const trashPath = path.join(notesDir.trashPath, trashName);

    fs.renameSync(this.filePath, trashPath);

    return trashPath;
  }

  /**
   * Create a backup in the history folder
   */
  createBackup(notesDir: NotesDirectory): string {
    const timestamp = Date.now();
    const backupName = `${this.name}_${timestamp}.md`;
    const backupPath = path.join(notesDir.historyPath, backupName);

    fs.copyFileSync(this.filePath, backupPath);

    return backupPath;
  }

  /**
   * Rename the note
   */
  rename(newName: string): void {
    const newPath = path.join(this.directory, `${newName}.md`);

    if (fs.existsSync(newPath)) {
      throw new Error(`A note with name "${newName}" already exists`);
    }

    fs.renameSync(this.filePath, newPath);
    this.filePath = newPath;
    (this as { name: string }).name = newName;
  }

  /**
   * Move to another folder
   */
  move(newFolder: string, notesDir: NotesDirectory): void {
    const newPath = path.join(notesDir.root, newFolder, `${this.name}.md`);

    // Create target directory if needed
    fs.mkdirSync(path.dirname(newPath), { recursive: true });

    fs.renameSync(this.filePath, newPath);
    this.filePath = newPath;
  }

  /**
   * Delete the note permanently
   */
  delete(): void {
    fs.unlinkSync(this.filePath);
  }

  /**
   * Delete the note asynchronously
   */
  async deleteAsync(): Promise<void> {
    await fs.promises.unlink(this.filePath);
  }

  /**
   * Copy the note to a new location
   */
  copy(destinationPath: string): NoteFile {
    fs.copyFileSync(this.filePath, destinationPath);
    return NoteFile.open(destinationPath);
  }
}

/**
 * Get all backups for a note
 */
export function getNoteBackups(noteName: string, notesDir: NotesDirectory): string[] {
  const historyPath = notesDir.historyPath;
  
  if (!fs.existsSync(historyPath)) {
    return [];
  }

  const files = fs.readdirSync(historyPath);
  const pattern = new RegExp(`^${escapeRegex(noteName)}_\\d+\\.md$`);
  
  return files
    .filter(file => pattern.test(file))
    .map(file => path.join(historyPath, file))
    .sort()
    .reverse(); // Most recent first
}

/**
 * Get all items in trash
 */
export function getTrashItems(notesDir: NotesDirectory): string[] {
  const trashPath = notesDir.trashPath;
  
  if (!fs.existsSync(trashPath)) {
    return [];
  }

  const files = fs.readdirSync(trashPath);
  return files
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(trashPath, file));
}

/**
 * Restore a note from trash
 */
export function restoreFromTrash(trashPath: string, notesDir: NotesDirectory): string {
  // Extract original name (remove timestamp suffix)
  const fileName = path.basename(trashPath, '.md');
  const match = fileName.match(/^(.+)_\d+$/);
  const originalName = match ? match[1] : fileName;

  let targetPath = path.join(notesDir.root, `${originalName}.md`);

  // If a note with that name exists, add a number suffix
  let counter = 1;
  while (fs.existsSync(targetPath)) {
    targetPath = path.join(notesDir.root, `${originalName} (${counter}).md`);
    counter++;
  }

  fs.renameSync(trashPath, targetPath);
  return targetPath;
}

/**
 * Empty the trash folder
 */
export function emptyTrash(notesDir: NotesDirectory): number {
  const trashPath = notesDir.trashPath;
  
  if (!fs.existsSync(trashPath)) {
    return 0;
  }

  const files = fs.readdirSync(trashPath);
  let count = 0;

  for (const file of files) {
    fs.unlinkSync(path.join(trashPath, file));
    count++;
  }

  return count;
}

// Helper function to escape regex special characters
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
