import { IsArray, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateLmsFolderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Present (even as an empty array, meaning "shared with no one right
  // now") replaces the whole share list.
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  shareOfferingIds?: string[];
}
