import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateTrainingSessionDto {
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  focus?: string;

  @IsOptional()
  @IsUUID()
  conductedByCoachId?: string;

  @IsOptional()
  @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED'])
  status?: string;
}
