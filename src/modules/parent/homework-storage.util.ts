// Parent homework-submission files -- PRIVATE Supabase Storage bucket
// ("homework-submissions"), signed URLs only, same pattern
// lms-storage.util.ts's own LMS_MATERIALS_BUCKET already uses -- a child's
// submitted work, never publicly reachable, readable only by the assigned
// faculty (via a signed URL) and the parent who uploaded it.

import { randomUUID } from 'crypto';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export const HOMEWORK_SUBMISSIONS_BUCKET = 'homework-submissions';

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    '.pptx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

export const HOMEWORK_FILE_MAX_SIZE_BYTES = 15 * 1024 * 1024;
export const HOMEWORK_FILE_MAX_COUNT = 5;

export const homeworkFileMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: HOMEWORK_FILE_MAX_SIZE_BYTES },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(
        new BadRequestException(
          'File must be a PDF, Office document, or image.',
        ),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

export function homeworkSubmissionObjectKeyFor(
  homeworkId: string,
  studentId: string,
  file: Express.Multer.File,
): string {
  const ext =
    ALLOWED_MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? '';
  return `${homeworkId}/${studentId}/${randomUUID()}${ext}`;
}
