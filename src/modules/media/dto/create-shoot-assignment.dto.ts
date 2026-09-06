import { ArrayUnique, IsArray, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateShootAssignmentDto {
  @IsString()
  @MinLength(1)
  eventTitle!: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsISO8601()
  scheduledAt!: string;

  @IsIn(['PHOTO', 'VIDEO', 'PHOTO_VIDEO'])
  outputType!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  crewIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  gearIds?: string[];
}
