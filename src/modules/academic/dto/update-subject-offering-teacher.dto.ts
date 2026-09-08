import { IsUUID } from 'class-validator';

export class UpdateSubjectOfferingTeacherDto {
  @IsUUID()
  teacherStaffId!: string;
}
