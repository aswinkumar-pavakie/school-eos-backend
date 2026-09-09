// Person photos live in the Supabase Storage "person-photos" bucket (public --
// see src/infrastructure/storage/storage.service.ts for the client). Multer
// only buffers the upload in memory here; PersonsService does the actual
// upload/delete via StorageService, and photo_object_key on the person table
// stores the path within the bucket (e.g. "photos/<uuid>.jpg"), same
// key/metadata-only convention the Documents module uses for objectKey.

import { randomUUID } from 'crypto';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export const PHOTOS_BUCKET = 'person-photos';

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const photoMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: PHOTO_MAX_SIZE_BYTES },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(
        new BadRequestException('Photo must be a JPEG, PNG, or WEBP image.'),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

export function photoObjectKeyFor(file: Express.Multer.File): string {
  const ext =
    ALLOWED_MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? '';
  return `photos/${randomUUID()}${ext}`;
}
