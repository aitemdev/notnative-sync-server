import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import pool from './db';

const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

// MIME types permitidos
const ALLOWED_MIME_TYPES = [
  // Imágenes
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  
  // PDF
  'application/pdf',
  
  // Excel
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  
  // Word
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  
  // Otros Office
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  
  // Genérico (se validará por extensión)
  'application/octet-stream',
];

// Extensiones permitidas (para cuando MIME type es genérico)
const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff',
  '.pdf',
  '.xls', '.xlsx',
  '.doc', '.docx',
  '.ppt', '.pptx',
];

/**
 * Valida si el MIME type está permitido
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * Valida si la extensión del archivo está permitida
 */
export function isAllowedExtension(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Genera hash SHA-256 de un buffer
 */
export function generateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Genera la ruta de almacenamiento basada en el hash
 * Estructura: {hash[0:2]}/{hash[2:4]}/{hash}
 */
export function getStoragePath(hash: string): string {
  const dir1 = hash.substring(0, 2);
  const dir2 = hash.substring(2, 4);
  return path.join(dir1, dir2, hash);
}

/**
 * Obtiene la ruta absoluta del archivo en el filesystem
 */
export function getAbsoluteFilePath(storageKey: string): string {
  return path.join(UPLOAD_DIR, storageKey);
}

/**
 * Crea los directorios necesarios para almacenar un archivo
 */
export async function ensureStorageDirectory(storageKey: string): Promise<void> {
  const filePath = getAbsoluteFilePath(storageKey);
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
}

/**
 * Guarda un archivo en el sistema de archivos
 */
export async function saveFile(buffer: Buffer, storageKey: string): Promise<void> {
  await ensureStorageDirectory(storageKey);
  const filePath = getAbsoluteFilePath(storageKey);
  await fs.promises.writeFile(filePath, buffer);
}

/**
 * Elimina un archivo del sistema de archivos
 */
export async function deleteFile(storageKey: string): Promise<void> {
  const filePath = getAbsoluteFilePath(storageKey);
  try {
    await unlink(filePath);
  } catch (error: any) {
    // Ignorar si el archivo no existe
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Verifica si un archivo existe en el sistema de archivos
 */
export async function fileExists(storageKey: string): Promise<boolean> {
  const filePath = getAbsoluteFilePath(storageKey);
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Calcula el uso total de storage de un usuario
 */
export async function calculateUserStorage(userId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(file_size), 0) as total_size
     FROM attachments
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return parseInt(result.rows[0].total_size, 10);
}

/**
 * Obtiene los límites de storage de un usuario
 */
export async function getUserStorageLimits(userId: string): Promise<{
  used: number;
  limit: number;
  available: number;
  percentage: number;
}> {
  const result = await pool.query(
    'SELECT storage_used, storage_limit FROM users WHERE id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('User not found');
  }
  
  const used = parseInt(result.rows[0].storage_used, 10);
  const limit = parseInt(result.rows[0].storage_limit, 10);
  const available = Math.max(0, limit - used);
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
  
  return { used, limit, available, percentage };
}

/**
 * Actualiza el storage usado de un usuario
 */
export async function updateUserStorage(userId: string, deltaBytes: number): Promise<void> {
  await pool.query(
    'UPDATE users SET storage_used = storage_used + $1, updated_at = NOW() WHERE id = $2',
    [deltaBytes, userId]
  );
}

/**
 * Verifica si un usuario tiene suficiente espacio para un archivo
 */
export async function checkStorageQuota(userId: string, fileSize: number): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const { used, limit, available } = await getUserStorageLimits(userId);
  
  if (fileSize > available) {
    return {
      allowed: false,
      reason: `Insufficient storage. You have ${formatBytes(available)} available, but need ${formatBytes(fileSize)}. Used: ${formatBytes(used)} / ${formatBytes(limit)}`,
    };
  }
  
  return { allowed: true };
}

/**
 * Formatea bytes a formato legible
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
