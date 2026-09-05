// A real HTML <form method="GET"> (or a plain query-string navigation built from
// one, e.g. this app's own search/filter forms) always serializes every field,
// including ones the user never touched — a blank <select> or empty <input> shows
// up as `key=` in the URL, never an omitted key. Every optional query DTO field uses
// @IsOptional(), which only treats null/undefined as "not provided" — an empty
// string still reaches @IsUUID()/@IsIn()/etc. and fails validation with a 400,
// even though "nothing selected" was clearly meant as "don't filter on this".
//
// This strips empty-string query values to undefined before class-validator ever
// sees them, globally, for every endpoint — scoped to query params only
// (ArgumentMetadata.type === 'query'). Request bodies are untouched: those are JSON
// built by this app's own Server Actions, which already normalize blank inputs to
// undefined themselves before sending, so there's nothing to strip there, and a
// genuinely-required body field submitted empty should still fail validation as
// itself, not silently vanish.
import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class EmptyQueryValuePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type === 'query' && value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === '') {
          delete (value as Record<string, unknown>)[key];
        }
      }
    }
    return value;
  }
}
