import { IsUUID } from 'class-validator';

export class ReassignClassTeacherDto {
  // The new academic year's real section row -- must resolve to the SAME
  // (grade_id, name) as the login was created with, or the reassign is
  // rejected (this endpoint moves a login's holder, it can't silently
  // repoint it to a different section).
  @IsUUID()
  sectionId!: string;

  @IsUUID()
  facultyPersonId!: string;
}
