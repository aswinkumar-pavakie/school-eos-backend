import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateStudentDutyDto {
  @IsUUID()
  studentId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  duties?: string;
}
