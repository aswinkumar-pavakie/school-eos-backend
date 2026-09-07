import { IsISO8601, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateStudentEventDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  location!: string;

  @IsString()
  @MinLength(1)
  purpose!: string;

  // Real staff person, picked via a search (see GET .../students-search's
  // sibling teacher-search route) -- never free-typed, so "their details"
  // (designation, phone, email) shown on the permission letter is always real.
  @IsUUID()
  monitoringTeacherPersonId!: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;
}
