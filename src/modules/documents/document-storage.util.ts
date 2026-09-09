// Document files (certificates, etc.) live in the Supabase Storage "documents"
// bucket -- PRIVATE, since a document can be marked isRestricted (see
// documents.service.ts, which always serves a short-lived signed URL rather
// than a public one). Multer only buffers the upload in memory here;
// DocumentsService does the actual upload/delete via StorageService.

import { randomUUID } from 'crypto';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export const DOCUMENTS_BUCKET = 'documents';

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export const documentMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_SIZE_BYTES },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(
        new BadRequestException(
          'File must be a JPEG, PNG, WEBP image, or PDF.',
        ),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

export function documentObjectKeyFor(file: Express.Multer.File): string {
  const ext =
    ALLOWED_MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? '';
  return `documents/${randomUUID()}${ext}`;
}
