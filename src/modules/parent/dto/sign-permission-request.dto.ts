import { IsString, MinLength } from 'class-validator';

// A plain base64 string (no data: prefix -- the mobile client strips it before
// sending), not a multipart file upload: React Native's own Blob polyfill
// cannot construct a Blob from raw bytes (only from strings/other Blobs), so a
// real multipart file part built from a signature captured as base64 was never
// actually possible from the app -- sending it as a normal JSON field and
// decoding it here (Buffer.from(base64, 'base64')) sidesteps that entirely.
export class SignPermissionRequestDto {
  @IsString()
  @MinLength(1)
  signaturePngBase64!: string;
}
