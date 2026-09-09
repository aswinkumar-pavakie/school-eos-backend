import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTeamDto {
  @IsUUID()
  sportId!: string;

  @IsOptional()
  @IsUUID()
  sportCategoryId?: string;

  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsUUID()
  coachId?: string;

  @IsOptional()
  @IsUUID()
  captainStudentId?: string;

  @IsOptional()
  @IsUUID()
  houseId?: string;
}
