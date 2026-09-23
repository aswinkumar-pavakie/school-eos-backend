import { IsIn, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateClassTeacherLoginDto {
  // The real, current-year section row this login starts out attached to.
  // Its grade_id + name become the login's permanent (grade, section_name)
  // identity -- see class-teacher-login.repository.ts.
  @IsUUID()
  sectionId!: string;

  @IsUUID()
  facultyPersonId!: string;

  @IsIn(['EMAIL', 'MOBILE'])
  identifierType!: 'EMAIL' | 'MOBILE';

  @IsString()
  identifierValue!: string;

  // Admin sets this login's initial password directly -- same posture as
  // every other admin-created login in this app (Community, Academic
  // Coordinator): no separate verification step, no temp-password email.
  @IsString()
  @MinLength(8)
  password!: string;
}
