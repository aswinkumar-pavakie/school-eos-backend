import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateLmsFolderDto {
  @IsUUID()
  subjectId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Which of the caller's own subject_offerings (for this exact subject)
  // this folder is shared with -- re-validated server-side regardless.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  shareOfferingIds?: string[];
}
