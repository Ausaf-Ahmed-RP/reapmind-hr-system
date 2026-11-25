import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_BASE = process.env.STORAGE_DIR || './uploads';

// Ensure directory exists
export function ensureUploadDir(subDir: string = 'resumes') {
  const targetDir = path.resolve(process.cwd(), UPLOAD_BASE, subDir);
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
  return path.resolve(process.cwd(), UPLOAD_BASE, storagePath);
}
