import { IsOptional, IsUUID } from 'class-validator';

export class TimetableQueryDto {
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  teacherStaffId?: string;
}
