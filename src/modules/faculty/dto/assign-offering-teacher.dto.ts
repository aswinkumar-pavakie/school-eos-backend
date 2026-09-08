import { IsOptional, IsUUID } from 'class-validator';

export class AssignOfferingTeacherDto {
  /** Null clears the teacher (an unassigned class), matching subject_offering.teacher_staff_id's own nullability. */
  @IsOptional()
  @IsUUID()
  teacherStaffId?: string | null;
}
