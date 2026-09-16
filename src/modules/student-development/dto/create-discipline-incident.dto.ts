import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDisciplineIncidentDto {
  @IsUUID()
  studentId!: string;

  @IsDateString()
  incidentDate!: string;

  @IsIn(['MINOR', 'MODERATE', 'SERIOUS', 'CRITICAL'])
  severity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  actionTaken?: string;
}
