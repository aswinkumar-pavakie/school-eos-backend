import { IsOptional, IsUUID } from 'class-validator';

export class ListByStudentQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;
}
