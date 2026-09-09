import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpsertSportsProfileDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  sportCategoryId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  joinedOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  positionOrRole?: string;
}
