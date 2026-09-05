// Thin wrapper over Supabase Storage (the project's Postgres and file storage
// live in the same Supabase project). Server-side only -- constructed with the
// service role key, which bypasses Row Level Security, so this must never be
// used from anything the browser can reach directly; every upload/delete/signed
// URL goes through this backend's own auth-guarded endpoints instead.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class StorageService {
  private readonly client: SupabaseClient;
  private readonly supabaseUrl: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const storageConfig = this.configService.get('storage', { infer: true });
    this.supabaseUrl = storageConfig.supabaseUrl;
    this.client = createClient(storageConfig.supabaseUrl, storageConfig.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async upload(bucket: string, path: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).upload(path, body, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
  }

  /** Best-effort -- callers use this for cleanup after a failure, never something
   * whose own failure should block the response. */
  async removeBestEffort(bucket: string, path: string): Promise<void> {
    await this.client.storage.from(bucket).remove([path]).catch(() => undefined);
  }

  /** For a PUBLIC bucket (e.g. person-photos) -- no network call, just the
   * deterministic public-object URL. */
  getPublicUrl(bucket: string, path: string): string {
    return `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }

  /** For a PRIVATE bucket (e.g. documents) -- a time-limited signed URL, since
   * the object itself is never publicly reachable. */
  async createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new Error(`Storage signed URL failed (${bucket}/${path}): ${error?.message}`);
    }
    return data.signedUrl;
  }
}
