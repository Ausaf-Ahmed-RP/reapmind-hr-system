import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const UPLOAD_BASE = process.env.STORAGE_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), 'uploads') : './uploads');

// Ensure directory exists
export function ensureUploadDir(subDir: string = 'resumes') {
  const base = path.isAbsolute(UPLOAD_BASE) ? UPLOAD_BASE : path.resolve(process.cwd(), UPLOAD_BASE);
  const targetDir = path.join(base, subDir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

export interface SavedFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export async function saveUploadedFile(file: File, subDir: string = 'resumes'): Promise<SavedFile> {
  const dir = ensureUploadDir(subDir);
  const ext = path.extname(file.name).toLowerCase() || '.bin';
  const randomName = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(dir, randomName);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(fullPath, buffer);

  const relativePath = path.join(subDir, randomName).replace(/\\/g, '/');

  return {
    storagePath: relativePath,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileSize: buffer.length,
  };
}

export function saveBuffer(buffer: Buffer, originalName: string, mimeType: string, subDir: string = 'resumes'): SavedFile {
  const dir = ensureUploadDir(subDir);
  const ext = path.extname(originalName).toLowerCase() || (mimeType === 'application/pdf' ? '.pdf' : '.jpg');
  const randomName = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(dir, randomName);

  fs.writeFileSync(fullPath, buffer);
  const relativePath = path.join(subDir, randomName).replace(/\\/g, '/');

  return {
    storagePath: relativePath,
    fileName: originalName,
    mimeType,
    fileSize: buffer.length,
  };
}

export function getAbsoluteFilePath(storagePath: string): string {
  const base = path.isAbsolute(UPLOAD_BASE) ? UPLOAD_BASE : path.resolve(process.cwd(), UPLOAD_BASE);
  return path.join(base, storagePath);
}
