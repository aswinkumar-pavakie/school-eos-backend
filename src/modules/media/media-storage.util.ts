// Media post images/videos live in the Supabase Storage "media-posts" bucket --
// PUBLIC (an Explore-feed post is meant to be publicly viewable, unlike
// documents.ts's private "documents" bucket), so getPublicUrl is enough, no signed
// URL round trip. Multer only buffers the upload in memory here; MediaPostsService
// does the actual upload via StorageService, same pattern documents.ts uses.

import { randomUUID } from 'crypto';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export const MEDIA_POSTS_BUCKET = 'media-posts';

// Real-world browsers/OSes don't always report a file's mimetype consistently --
// a phone photo picked from Windows Explorer, or certain camera exports, can
// legitimately arrive as "application/octet-stream" (the generic fallback) even
// though the file itself is a perfectly good JPEG. Keyed by extension here (not
// mimetype) for exactly that reason -- checked below against BOTH the reported
// mimetype and the file's own extension, accepting if either is recognised.
const ALLOWED_EXT_TO_MEDIA_TYPE: Record<string, 'IMAGE' | 'VIDEO'> = {
  '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.png': 'IMAGE', '.webp': 'IMAGE', '.gif': 'IMAGE',
  '.heic': 'IMAGE', '.heif': 'IMAGE',
  '.mp4': 'VIDEO', '.mov': 'VIDEO', '.webm': 'VIDEO', '.m4v': 'VIDEO', '.avi': 'VIDEO', '.mkv': 'VIDEO',
};

const ALLOWED_MIME_TO_MEDIA_TYPE: Record<string, 'IMAGE' | 'VIDEO'> = {
  'image/jpeg': 'IMAGE', 'image/png': 'IMAGE', 'image/webp': 'IMAGE', 'image/gif': 'IMAGE',
  'image/heic': 'IMAGE', 'image/heif': 'IMAGE',
  'video/mp4': 'VIDEO', 'video/quicktime': 'VIDEO', 'video/webm': 'VIDEO',
  'video/x-msvideo': 'VIDEO', 'video/x-matroska': 'VIDEO',
};

function mediaTypeForFile(file: Express.Multer.File): 'IMAGE' | 'VIDEO' | null {
  return ALLOWED_MIME_TO_MEDIA_TYPE[file.mimetype] ?? ALLOWED_EXT_TO_MEDIA_TYPE[extname(file.originalname).toLowerCase()] ?? null;
}

export function mediaTypeFor(file: Express.Multer.File): 'IMAGE' | 'VIDEO' {
  return mediaTypeForFile(file) ?? (file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE');
}

// Matches the real "media-posts" Supabase Storage bucket's own file_size_limit
// (its project-wide cap, not a number invented here) -- keeping multer's own check
// in sync so a file fails fast and clearly here instead of confusingly at the
// storage upload step.
export const MEDIA_POST_MAX_SIZE_BYTES = 40 * 1024 * 1024;
export const MEDIA_POST_MAX_FILES = 10;

export const mediaPostMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MEDIA_POST_MAX_SIZE_BYTES, files: MEDIA_POST_MAX_FILES },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    if (!mediaTypeForFile(file)) {
      cb(
        new BadRequestException(
          `"${file.originalname}" isn't a supported photo/video format. Use JPEG, PNG, WEBP, GIF or HEIC for photos, or MP4, MOV, WEBM, AVI or MKV for video.`,
        ),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

export function mediaPostObjectKeyFor(file: Express.Multer.File): string {
  const ext = extname(file.originalname).toLowerCase() || (file.mimetype.startsWith('video/') ? '.mp4' : '.jpg');
  return `posts/${randomUUID()}${ext}`;
}
