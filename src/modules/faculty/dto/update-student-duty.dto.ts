import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateStudentDutyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  duties?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'ENDED'])
  status?: string;
}
