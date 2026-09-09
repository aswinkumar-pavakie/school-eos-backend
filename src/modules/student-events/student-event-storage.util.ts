// A parent's digital signature lives in the Supabase Storage "event-signatures"
// bucket -- PRIVATE (unlike media-posts' public bucket: a legal signature must
// never be publicly reachable), served only via a short-lived signed URL when a
// permission letter is generated, same pattern documents.ts's private
// "documents" bucket already uses.
//
// The mobile signature pad sends its capture as a plain base64 string in a
// JSON body, not a multipart file (see SignPermissionRequestDto's own note on
// why -- React Native's Blob polyfill can't build a Blob from raw bytes), so
// there is no multer/fileFilter step here; ParentPermissionsService decodes
// the base64 itself and validates the result with isRealPngBuffer below.

import { randomUUID } from 'crypto';

export const EVENT_SIGNATURES_BUCKET = 'event-signatures';

export const SIGNATURE_MAX_SIZE_BYTES = 2 * 1024 * 1024;

export function signatureObjectKeyFor(participantId: string): string {
  // One signature per participant row, deterministically named -- a re-sign
  // (reject then re-add, the only way to get a second attempt) always lands on
  // a fresh participant row/id anyway, so no collision risk, and this makes a
  // stray orphaned object trivially traceable back to its request.
  return `signatures/${participantId}-${randomUUID()}.png`;
}

// PNG file signature (first 8 bytes, every real PNG starts with this -- see
// the PNG spec's own file header) -- the real content check, run once the
// full buffer is decoded (see ParentPermissionsService.sign), so a
// mislabelled/spoofed/corrupt upload can never reach Storage as if it were a
// genuine signature.
const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isRealPngBuffer(buffer: Buffer): boolean {
  return buffer.length >= PNG_MAGIC_BYTES.length && buffer.subarray(0, PNG_MAGIC_BYTES.length).equals(PNG_MAGIC_BYTES);
}
