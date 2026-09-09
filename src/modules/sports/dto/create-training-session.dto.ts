import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateTrainingSessionDto {
  @IsUUID()
  teamId!: string;

  @IsISO8601()
  scheduledAt!: string;

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
}
