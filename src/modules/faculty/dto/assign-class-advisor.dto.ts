import { IsUUID } from 'class-validator';

export class AssignClassAdvisorDto {
  /** The person_id (not staff_id) of the faculty member being made advisor -- role_assignment is keyed by person_id. */
  @IsUUID()
  personId!: string;
}
