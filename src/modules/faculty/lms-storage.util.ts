// Current Term (LMS) material files -- PRIVATE Supabase Storage bucket
// ("lms-materials"), signed URLs only, same pattern documents.ts's own
// DOCUMENTS_BUCKET already uses -- these are real class materials, scoped to
// specific real classes, never publicly reachable like Media Room's own
// public bucket.

import { randomUUID } from 'crypto';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export const LMS_MATERIALS_BUCKET = 'lms-materials';

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

export const LMS_FILE_MAX_SIZE_BYTES = 25 * 1024 * 1024;

export const lmsFileMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: LMS_FILE_MAX_SIZE_BYTES },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(new BadRequestException('File must be a PDF, Office document, or image.'), false);
      return;
    }
    cb(null, true);
  },
};

export function lmsFileObjectKeyFor(folderId: string, file: Express.Multer.File): string {
  const ext = ALLOWED_MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? '';
  return `lms/${folderId}/${randomUUID()}${ext}`;
}
