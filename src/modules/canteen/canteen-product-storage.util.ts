// Canteen product photos live in the Supabase Storage "canteen-products"
// bucket (public) -- same convention as person-photos (see
// admin/photo-storage.util.ts). Image is optional: a product with no
// image_object_key falls back to a default canteen-themed illustration,
// rendered entirely client-side (no placeholder file stored here).

import { randomUUID } from 'crypto';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export const CANTEEN_PRODUCTS_BUCKET = 'canteen-products';

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const PRODUCT_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const productImageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: PRODUCT_IMAGE_MAX_SIZE_BYTES },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(
        new BadRequestException('Product image must be a JPEG, PNG, or WEBP image.'),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

export function productImageObjectKeyFor(file: Express.Multer.File): string {
  const ext =
    ALLOWED_MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? '';
  return `products/${randomUUID()}${ext}`;
}
