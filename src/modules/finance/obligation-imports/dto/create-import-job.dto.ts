import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateImportJobDto {
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  // Object-storage key of the uploaded file. No document/upload service exists yet in
  // this codebase (see Finance README) — this is recorded for traceability but the
  // actual row data for validate/confirm is sent inline in those requests, not read
  // back from this key.
  @IsString()
  @IsNotEmpty()
  sourceObjectKey!: string;

  @IsOptional()
  @IsString()
  jobType?: string;
}
