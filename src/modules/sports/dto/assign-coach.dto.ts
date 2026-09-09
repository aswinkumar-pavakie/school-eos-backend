import { IsUUID } from 'class-validator';

export class AssignCoachDto {
  @IsUUID()
  coachId!: string;
}
