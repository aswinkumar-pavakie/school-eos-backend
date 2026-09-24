import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ReassignClassTeacherDto {
  // The new academic year's real section row -- must resolve to the SAME
  // (grade_id, name) as the login was created with, or the reassign is
  // rejected (this endpoint moves a login's holder, it can't silently
  // repoint it to a different section).
  @IsUUID()
  sectionId!: string;
  @IsUUID()
  facultyPersonId!: string;
  // Change the shared password as part of the hand-over (default true). The
  // previous holder always loses their sessions and push devices either way;
  // rotating is what stops them signing straight back in with the old one.
  @IsOptional()
  @IsBoolean()
  rotatePassword?: boolean;
}
