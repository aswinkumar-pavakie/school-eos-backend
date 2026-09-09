import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStaffAppraisalDto {
  @IsString()
  @MinLength(4)
  cycle!: string; // e.g. "2026-2027"

  @IsString()
  @MinLength(20)
  selfAssessment!: string;

  @IsOptional()
  @IsString()
  attachmentObjectKey?: string;

  @IsOptional()
  @IsString()
  attachmentFileName?: string;
}
