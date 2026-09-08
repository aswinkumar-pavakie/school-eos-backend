import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class UpdateShootAssignmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  eventTitle?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsIn(['PHOTO', 'VIDEO', 'PHOTO_VIDEO'])
  outputType?: string;

  @IsOptional()
  @IsIn(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: string;

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
